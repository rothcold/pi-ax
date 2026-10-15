import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { AxTransport, AxRpcError, type Process, type RpcOptions } from './ax/client.js';
import { status as grpcStatus } from '@grpc/grpc-js';
import { EgressPolicyClient, EgressRpcError, preflightEgress } from './ax/egress-client.js';
import { DEFAULT_PROCESS_TIMEOUT_SECONDS, readCredentialEnv, redactText, validateEgressConfig, type EgressConfig, type AxConfig } from './config.js';
import { createSnapshot, sha256 } from './workspace.js';
import { ARTIFACT_NAMES, MAX_LOG_BYTES, MAX_PATCH_BYTES, MAX_REQUEST_BYTES, MAX_RESULT_BYTES, WORKER_COMMAND, parseWorkerRequest, parseWorkerResult, parseWorkerTermination, workerPaths, type WorkerResult } from './worker-protocol.js';
import { TaskBusyError, TaskStore, atomicWrite, boundedRead, privateDirectory } from './task-store.js';
import type { TaskRecord, TaskView } from './task-schema.js';

export type TaskTransport = Pick<AxTransport, 'createTask' | 'getTask' | 'resumeTask' | 'deleteTask' | 'ready' | 'startProcess' | 'getProcess' | 'signalProcess' | 'readFile' | 'writeFile' | 'close'>;
export interface ManagerOptions {
  store: TaskStore;
  config: () => AxConfig;
  environment?: NodeJS.ProcessEnv;
  transport?: (config: AxConfig) => TaskTransport;
  egressClient?: (config: EgressConfig) => Pick<EgressPolicyClient, 'createPolicy' | 'getPolicy' | 'close'>;
  readinessMs?: number;
  pollMs?: number;
  cancelGraceMs?: number;
  cancelKillMs?: number;
}
interface ArchivedFile { name: string; sha256: string; bytes: number; remoteSha256: string }

// Only fixed native operation/status text may survive in the v1 note. Never use
// error.message/details/cause/metadata, including for otherwise typed errors.
const policyFailureNotes = new Map<number, string>(Array.from({ length: 16 }, (_, index) => {
  const code = index + 1;
  return [code, `Last policy attempt: CreateActorEgressPolicy: ${grpcStatus[code]}. ${code === grpcStatus.UNAUTHENTICATED ? 'Refresh approved bootstrap credentials before future spawns. ' : ''}Remote policy state unknown; retained task, no retry or activation.`] as const;
}));
function policyFailureNote(error: unknown): string {
  const code = error instanceof EgressRpcError && error.operation === 'CreateActorEgressPolicy' ? error.code : grpcStatus.UNKNOWN;
  return policyFailureNotes.get(code) ?? policyFailureNotes.get(grpcStatus.UNKNOWN)!;
}
function unstartedPolicyFailure(record: TaskRecord): boolean {
  return record.remoteAttempted && !record.startAttempted && record.view.stage === 'egress_policy_requested' &&
    record.view.state === 'unknown' && record.view.processId === null && record.view.processState === 'unknown';
}

/** Resolve existing ancestors without creating prospective storage inside source trees. */
async function prospectiveRealpath(directory: string): Promise<string> {
  const missing: string[] = [];
  let current = directory;
  for (;;) {
    try { return path.join(await realpath(current), ...missing); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // An existing dangling symlink must not be treated as a missing directory.
      try { await lstat(current); throw new Error('Task storage ancestor cannot be resolved'); }
      catch (statError) { if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError; }
      missing.unshift(path.basename(current));
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

/** Local ledger plus one-shot RPCs, not a scheduler or a resumable Pi session. */
export class TaskManager {
  readonly store: TaskStore;
  private readonly shutdown = new AbortController();
  private readonly clients = new Set<{ close(): void }>();
  private readonly background = new Set<Promise<void>>();
  private readonly environment: NodeJS.ProcessEnv;
  constructor(private readonly options: ManagerOptions) {
    this.store = options.store;
    this.environment = options.environment ?? process.env;
  }
  private client(record: TaskRecord): TaskTransport {
    const client = (this.options.transport ?? ((config) => new AxTransport(config)))(record.config);
    this.clients.add(client);
    return client;
  }
  private releaseClient(client: TaskTransport): void { client.close(); this.clients.delete(client); }
  private rpc(signal?: AbortSignal): RpcOptions {
    return { signal: signal ? AbortSignal.any([signal, this.shutdown.signal]) : this.shutdown.signal };
  }
  private checkOpen(signal?: AbortSignal): void {
    if (this.shutdown.signal.aborted || signal?.aborted) throw new Error('Local operation aborted; remote work was not cancelled');
  }
  private async save(record: TaskRecord): Promise<void> { await this.store.write(record); }
  private secrets(record: TaskRecord): string[] {
    return record.config.credentialEnv.map((key) => this.environment[key]).filter((v): v is string => Boolean(v));
  }
  async spawn(prompt: string, cwd: string, signal?: AbortSignal): Promise<TaskView> {
    this.checkOpen(signal);
    const loaded = this.options.config();
    if (!loaded.egress) throw new Error('New tasks require explicit egress configuration; retained tasks remain manageable');
    const config = { ...loaded, egress: validateEgressConfig(loaded.egress) };
    // Fail closed locally before snapshots, reservations or any remote side effect.
    preflightEgress(config.egress);
    // Fail missing explicit credentials before reserving remote resources; values never enter the ledger.
    readCredentialEnv(config, this.environment);
    const relativeState = path.relative(await realpath(cwd), await prospectiveRealpath(this.store.root));
    if (relativeState === '' || (!relativeState.startsWith(`..${path.sep}`) && relativeState !== '..' && !path.isAbsolute(relativeState))) {
      throw new Error('Task state directory must be outside the snapshot working tree');
    }
    await this.store.initialize();
    const snapshot = await createSnapshot(cwd, [config.egress.bearerTokenFile]);
    this.checkOpen(signal);
    const id = `ax-${randomUUID()}`;
    const request = parseWorkerRequest(Buffer.from(JSON.stringify({ version: 1, taskId: id, prompt,
      provider: config.workerProvider, model: config.workerModel, credentialEnv: config.credentialEnv, snapshotSha256: snapshot.sha256 })));
    const now = new Date().toISOString();
    const record: TaskRecord = {
      version: 1, config, snapshotSha256: snapshot.sha256, remoteAttempted: false, startAttempted: false, resultOutcome: null, patchComplete: false,
      view: { taskId: id, state: 'pending', stage: 'reserved', active: true, createdAt: now, updatedAt: now,
        remote: `${config.atespace}/${id}`, processId: null, processState: 'unknown', exitCode: null, deadlineAt: null, deadlineExceeded: false,
        cancellationRequested: false, cancellationConfirmed: false, terminationConfirmed: false, archiveDirectory: null, archiveComplete: false, patchPath: null,
        note: 'Accepted locally; query ax_status. No automatic retry or deletion.' },
    };
    let release: (() => Promise<void>) | undefined;
    await this.store.reserve(async () => {
      if ((await this.store.list()).some((r) => r.view.active)) throw new Error('One active task is already reserved; use ax_status before starting another');
      await privateDirectory(this.store.directory(id));
      await this.save(record);
      try {
        await atomicWrite(path.join(this.store.directory(id), 'snapshot.json'), snapshot.payload);
        await atomicWrite(path.join(this.store.directory(id), 'request.json'), JSON.stringify(request));
        release = await this.store.lock(id);
      } catch {
        record.view.state = 'failed'; record.view.active = false; record.view.note = 'Local input persistence failed; no remote operation attempted';
        await this.save(record);
        throw new Error(`Local preparation failed; retained task ${id}`);
      }
    });
    const initial = structuredClone(record.view);
    const unlock = release!;
    const job = this.launch(record).finally(unlock);
    this.background.add(job);
    // launch records errors itself; an I/O error still leaves its last durable intent for recovery.
    void job.catch(() => {}).finally(() => this.background.delete(job));
    return initial;
  }
  private async stage(record: TaskRecord, stage: string): Promise<void> {
    record.view.stage = stage;
    await this.save(record);
    this.checkOpen();
  }
  private async launch(record: TaskRecord): Promise<void> {
    const client = this.client(record);
    const ref = { atespace: record.config.atespace, name: record.view.taskId };
    try {
      this.checkOpen();
      record.remoteAttempted = true;
      await this.stage(record, 'create_requested');
      await client.createTask(ref, record.config.workerImage, this.rpc());
      await this.stage(record, 'egress_policy_requested');
      const egress = validateEgressConfig(record.config.egress);
      const policyClient = (this.options.egressClient ?? ((config) => new EgressPolicyClient(config)))(egress);
      this.clients.add(policyClient);
      try {
        const policy = await policyClient.createPolicy(ref, this.rpc());
        // CIDRRule is a set: equal length plus every unique configured member also excludes response duplicates.
        if (policy.actor.atespace !== ref.atespace || policy.actor.name !== ref.name || policy.name !== 'default' ||
            !policy.uid || !policy.version || policy.cidrs.length !== egress.cidrs.length ||
            egress.cidrs.some((cidr) => !policy.cidrs.includes(cidr))) {
          throw new Error('Egress policy binding mismatch');
        }
        await this.stage(record, 'egress_policy_verified');
      } finally { policyClient.close(); this.clients.delete(policyClient); }
      await this.stage(record, 'activation_requested');
      await client.resumeTask(ref, this.rpc());
      await this.stage(record, 'waiting_ready');
      const until = Date.now() + (this.options.readinessMs ?? 120_000);
      while (!(await client.ready(ref, this.rpc()))) {
        if (Date.now() >= until) throw new Error('Readiness deadline');
        await delay(this.options.pollMs ?? 500, undefined, this.rpc());
      }
      await this.stage(record, 'uploading');
      const paths = workerPaths();
      await client.writeFile(ref, paths.snapshot, await boundedRead(path.join(this.store.directory(ref.name), 'snapshot.json'), 48 * 1024 * 1024), this.rpc());
      await client.writeFile(ref, paths.request, await boundedRead(path.join(this.store.directory(ref.name), 'request.json'), MAX_REQUEST_BYTES), this.rpc());
      const env = readCredentialEnv(record.config, this.environment);
      record.startAttempted = true;
      record.view.deadlineAt = new Date(Date.now() + DEFAULT_PROCESS_TIMEOUT_SECONDS * 1000).toISOString();
      await this.stage(record, 'start_requested');
      const process = await client.startProcess(ref, { command: [...WORKER_COMMAND], cwd: '/workspace', env, timeoutSeconds: DEFAULT_PROCESS_TIMEOUT_SECONDS }, this.rpc());
      if (!process.processId) throw new Error('Missing process identity');
      record.view.processId = process.processId;
      record.view.stage = 'started';
      this.observeProcess(record, process);
      record.view.note = 'Worker started once; use ax_result to export artifacts before ax_destroy';
      await this.save(record);
    } catch (error) {
      record.view.state = record.remoteAttempted ? 'unknown' : 'failed';
      record.view.active = record.remoteAttempted;
      record.view.note = unstartedPolicyFailure(record) ? policyFailureNote(error)
        : 'Preparation interrupted or reply lost; no retry. Retained identity permits status/result/destroy.';
      await this.save(record);
    } finally { this.releaseClient(client); }
  }
  private observeProcess(record: TaskRecord, process: Process): void {
    if (record.view.processId !== process.processId) throw new Error('Process identity mismatch');
    if (process.state === 'PROCESS_STATE_EXITED') {
      record.view.processState = 'exited'; record.view.exitCode = process.exitCode;
    } else if (process.state === 'PROCESS_STATE_RUNNING') {
      record.view.processState = 'running'; record.view.active = true;
    } else { record.view.processState = 'unknown'; record.view.active = true; }
    this.outcome(record);
  }
  private outcome(record: TaskRecord): void {
    const view = record.view;
    view.deadlineExceeded = view.deadlineAt !== null && Date.now() >= Date.parse(view.deadlineAt);
    view.active = view.processState !== 'exited' || view.terminationConfirmed !== true;
    view.cancellationConfirmed = !view.active && view.cancellationRequested;
    if (view.processState === 'exited' && view.terminationConfirmed === true) {
      view.state = record.resultOutcome === 'completed' && view.exitCode === 0 ? 'completed'
        : view.cancellationConfirmed ? 'cancelled'
          : record.resultOutcome === 'failed' ? 'failed' : 'incomplete';
    } else { view.state = view.processState === 'running' ? 'running' : 'unknown'; }
  }
  private async bytes(client: TaskTransport, record: TaskRecord, file: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of client.readFile({ atespace: record.config.atespace, name: record.view.taskId }, file, { ...this.rpc(signal), maxBytes })) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Artifact limit exceeded');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  private async manifest(client: TaskTransport, record: TaskRecord, signal?: AbortSignal): Promise<{ result: WorkerResult; bytes: Buffer }> {
    const bytes = await this.bytes(client, record, workerPaths().result, MAX_RESULT_BYTES, signal);
    const result = parseWorkerResult(bytes);
    if (result.taskId !== record.view.taskId || result.snapshotSha256 !== record.snapshotSha256) throw new Error('Worker correlation mismatch');
    record.resultOutcome = result.outcome;
    record.patchComplete = result.patchComplete;
    return { result, bytes };
  }
  private async termination(client: TaskTransport, record: TaskRecord, signal?: AbortSignal): Promise<Buffer> {
    const bytes = await this.bytes(client, record, workerPaths().termination, 4096, signal);
    const proof = parseWorkerTermination(bytes);
    if (proof.taskId !== record.view.taskId || proof.snapshotSha256 !== record.snapshotSha256) throw new Error('Termination correlation mismatch');
    record.view.terminationConfirmed = true;
    return bytes;
  }
  private async refresh(client: TaskTransport, record: TaskRecord, signal?: AbortSignal): Promise<void> {
    if (record.view.state === 'destroyed') return;
    const ref = { atespace: record.config.atespace, name: record.view.taskId };
    if (record.view.stage === 'delete_requested') {
      try { await client.getTask(ref, this.rpc(signal)); }
      catch (error) {
        if (error instanceof AxRpcError && error.code === 5) {
          record.view.state = 'destroyed'; record.view.active = false; record.view.stage = 'deleted';
          record.view.note = 'Deletion reconciled from AX NotFound; local records/results retained'; return;
        }
      }
      record.view.state = 'unknown'; record.view.note = 'Deletion not confirmed; do not assume remote cleanup'; return;
    }
    if (!record.remoteAttempted) {
      record.view.state = 'failed'; record.view.active = false;
      record.view.note = 'Local preparation stopped before remote create; no automatic restart'; return;
    }
    if (record.view.processState !== 'exited') {
      try {
        if (record.view.processId) this.observeProcess(record, await client.getProcess(ref, record.view.processId, this.rpc(signal)));
        else { await client.getTask(ref, this.rpc(signal)); record.view.processState = 'unknown'; }
      } catch { record.view.processState = 'unknown'; }
    }
    try { await this.manifest(client, record, signal); }
    catch { /* A missing or unavailable manifest is not process failure. */ }
    try { await this.termination(client, record, signal); }
    catch { /* Wrapper exit alone cannot confirm termination of detached Pi tools. */ }
    this.outcome(record);
    const policyNote = unstartedPolicyFailure(record) && [...policyFailureNotes.values()].includes(record.view.note) ? record.view.note : undefined;
    record.view.note = policyNote ?? (record.view.processState === 'unknown'
      ? 'Remote execution unknown; never retry StartProcess. Retain this task or explicitly destroy with loss consent.'
      : record.view.processState === 'exited'
        ? record.view.terminationConfirmed === true
          ? 'Wrapper exit and owned-descendant termination confirmed. Export with ax_result.'
          : 'Wrapper exited but owned-descendant termination is unconfirmed; reservation retained. Query again or explicitly destroy with loss consent.'
        : 'Guest reports running; timeout deadline is advisory, not proof of watchdog termination.');
    if (record.view.processState === 'unknown') record.view.active = true;
  }
  private async operate(id: string, signal: AbortSignal | undefined, work: (client: TaskTransport, record: TaskRecord) => Promise<void>): Promise<TaskView> {
    this.checkOpen(signal);
    await this.store.initialize();
    const release = await this.store.lock(id);
    let client: TaskTransport | undefined;
    try {
      const record = await this.store.read(id);
      client = this.client(record);
      await work(client, record);
      await this.save(record);
      return structuredClone(record.view);
    } finally { if (client) this.releaseClient(client); await release(); }
  }
  async status(id?: string, signal?: AbortSignal): Promise<TaskView[]> {
    const records = id ? [await this.store.read(id)] : await this.store.list();
    const views: TaskView[] = [];
    for (const record of records) {
      try { views.push(await this.operate(record.view.taskId, signal, (c, r) => this.refresh(c, r, signal))); }
      catch (error) {
        if (!(error instanceof TaskBusyError)) throw error;
        const stored = await this.store.read(record.view.taskId);
        views.push({ ...stored.view, note: 'Local operation in progress; showing last persisted state' });
      }
    }
    return views;
  }
  private redactedJson(value: unknown, secrets: string[]): string {
    return JSON.stringify(value, (_key, v: unknown) => typeof v === 'string' ? redactText(v, secrets) : v, 2);
  }
  private redactLog(data: Buffer, secrets: string[], jsonl: boolean): Buffer {
    const text = data.toString('utf8');
    if (!jsonl) return Buffer.from(redactText(text, secrets));
    const redacted = text.split('\n').map((line) => {
      if (!line) return line;
      try { return this.redactedJson(JSON.parse(line), secrets).replace(/\n\s*/g, ''); }
      catch { return redactText(line, secrets); }
    }).join('\n');
    return Buffer.from(redactText(redacted, secrets));
  }
  private async exportArtifacts(client: TaskTransport, record: TaskRecord, signal?: AbortSignal): Promise<void> {
    if (record.view.archiveComplete && await this.archiveValid(record)) return;
    const directory = path.join(this.store.directory(record.view.taskId), 'results');
    await privateDirectory(directory);
    const secrets = this.secrets(record);
    const files: ArchivedFile[] = [];
    const issues: string[] = [];
    let manifest: { result: WorkerResult; bytes: Buffer } | undefined;
    try { manifest = await this.manifest(client, record, signal); } catch { issues.push('manifest unavailable or invalid'); }
    const result = manifest?.result;
    const persist = async (name: string, raw: Buffer, data: Buffer) => {
      if (name !== 'changes.patch' && data.length > MAX_LOG_BYTES * 2) throw new Error('Redacted text artifact exceeds local bound');
      await atomicWrite(path.join(directory, name), data);
      files.push({ name, sha256: sha256(data), bytes: data.length, remoteSha256: sha256(raw) });
    };
    if (result) {
      await persist('result.json', manifest!.bytes, Buffer.from(this.redactedJson(result, secrets)));
      for (const artifact of result.artifacts) {
        try {
          const data = await this.bytes(client, record, path.join(workerPaths().artifacts, artifact.name), artifact.name === 'changes.patch' ? MAX_PATCH_BYTES : MAX_LOG_BYTES, signal);
          if (data.length !== artifact.bytes || sha256(data) !== artifact.sha256) throw new Error('Artifact integrity mismatch');
          await persist(artifact.name, data, artifact.name === 'changes.patch' ? data : this.redactLog(data, secrets, artifact.name === 'events.jsonl'));
        } catch { issues.push(`unrecovered artifact: ${artifact.name}`); }
      }
    } else {
      for (const name of ['started.json', 'events.jsonl', 'stderr.log']) {
        try {
          const data = await this.bytes(client, record, path.join(workerPaths().artifacts, name), MAX_LOG_BYTES, signal);
          if (name === 'started.json') {
            const started = JSON.parse(data.toString()) as { version: number; taskId: string; snapshotSha256: string; startedAt: string };
            if (started.version !== 1 || started.taskId !== record.view.taskId || started.snapshotSha256 !== record.snapshotSha256 || !Number.isFinite(Date.parse(started.startedAt))) throw new Error('Started marker correlation mismatch');
            await persist(name, data, Buffer.from(this.redactedJson(started, secrets)));
          } else { await persist(name, data, this.redactLog(data, secrets, name === 'events.jsonl')); }
        } catch { issues.push(`unavailable partial artifact: ${name}`); }
      }
    }
    try {
      const proof = await this.termination(client, record, signal);
      await persist('termination.json', proof, proof);
    } catch { issues.push('owned-descendant termination evidence unavailable'); }
    // Archive marker is committed last; each file and containing directory have been fsynced.
    const complete = Boolean(result && issues.length === 0 && record.view.processState === 'exited' && record.view.terminationConfirmed === true);
    await atomicWrite(path.join(directory, 'archive.json'), JSON.stringify({ version: 1, taskId: record.view.taskId, snapshotSha256: record.snapshotSha256,
      complete, processState: record.view.processState, exitCode: record.view.exitCode, files, issues }, null, 2));
    record.view.archiveDirectory = directory; record.view.archiveComplete = complete;
    record.view.patchPath = files.some((f) => f.name === 'changes.patch') ? path.join(directory, 'changes.patch') : null;
    this.outcome(record);
    record.view.note = complete ? 'Artifacts hash-verified and atomically archived; patch is not applied. Review files before use.'
      : 'Partial export only; unconfirmed state or unrecovered artifacts remain. Remote resources retained.';
  }
  private async archiveValid(record: TaskRecord): Promise<boolean> {
    try {
      const directory = path.join(this.store.directory(record.view.taskId), 'results');
      const manifest = JSON.parse((await boundedRead(path.join(directory, 'archive.json'), MAX_RESULT_BYTES)).toString()) as { complete: boolean; taskId: string; snapshotSha256: string; files: ArchivedFile[] };
      if (!manifest.complete || manifest.taskId !== record.view.taskId || manifest.snapshotSha256 !== record.snapshotSha256 || !Array.isArray(manifest.files)) return false;
      const names = new Set<string>();
      for (const f of manifest.files) {
        if (!['result.json', 'termination.json', ...ARTIFACT_NAMES].includes(f.name) || names.has(f.name)) return false;
        names.add(f.name);
        const data = await boundedRead(path.join(directory, f.name), f.name === 'changes.patch' ? MAX_PATCH_BYTES : MAX_LOG_BYTES * 2);
        if (data.length !== f.bytes || sha256(data) !== f.sha256) return false;
        if (f.name === 'termination.json') {
          const proof = parseWorkerTermination(data);
          if (proof.taskId !== record.view.taskId || proof.snapshotSha256 !== record.snapshotSha256) return false;
        }
      }
      return names.has('termination.json') && names.has('result.json') && names.has('events.jsonl') && names.has('stderr.log') && (!record.patchComplete || names.has('changes.patch'));
    } catch { return false; }
  }
  async result(id: string, signal?: AbortSignal): Promise<TaskView> {
    return this.operate(id, signal, async (client, record) => {
      if (record.view.state === 'destroyed') {
        record.view.archiveComplete = await this.archiveValid(record);
        record.view.note = record.view.archiveComplete ? 'Retained local archive; remote task was destroyed' : 'Remote destroyed; complete local archive unavailable';
        return;
      }
      if (record.view.archiveComplete && await this.archiveValid(record) && record.view.stage !== 'delete_requested') {
        record.view.note = 'Verified retained local archive; no remote fetch needed. Patch is not applied.';
        return;
      }
      await this.refresh(client, record, signal);
      if (record.view.stage !== 'deleted') await this.exportArtifacts(client, record, signal);
    });
  }
  async cancel(id: string, signal?: AbortSignal): Promise<TaskView> {
    return this.operate(id, signal, async (client, record) => {
      if (record.view.state === 'destroyed') return;
      await this.refresh(client, record, signal);
      const wrapperExited = () => record.view.processState === 'exited';
      if (record.view.stage === 'deleted' || wrapperExited()) return;
      record.view.cancellationRequested = true;
      record.view.note = 'Cancellation requested, not yet confirmed';
      await this.save(record);
      if (!record.view.processId) {
        record.view.state = 'unknown'; record.view.note = 'No process ID to signal; explicit ax_destroy with unrecovered-loss consent is the only destructive fallback'; return;
      }
      const ref = { atespace: record.config.atespace, name: id };
      try {
        for (const [kind, wait] of [['SIGNAL_TERM', this.options.cancelGraceMs ?? 5000], ['SIGNAL_KILL', this.options.cancelKillMs ?? 5000]] as const) {
          this.checkOpen(signal);
          record.view.stage = kind === 'SIGNAL_TERM' ? 'term_requested' : 'kill_requested';
          await this.save(record);
          try { if (record.view.processState !== 'exited') await client.signalProcess(ref, record.view.processId, kind, this.rpc(signal)); }
          catch { /* Lost signal reply still requires GetProcess confirmation, never blind success. */ }
          const until = Date.now() + wait;
          do {
            const observed = await client.getProcess(ref, record.view.processId, this.rpc(signal));
            this.observeProcess(record, observed);
            if (observed.state === 'PROCESS_STATE_EXITED') {
              await this.refresh(client, record, signal);
              if (record.view.terminationConfirmed === true) {
                record.view.note = 'Wrapper exit and owned-descendant termination confirmed after cancellation request; signal vs natural exit cause is not established. Export results before destroy.';
                return;
              }
            }
            if (Date.now() >= until) break;
            await delay(this.options.pollMs ?? 250, undefined, this.rpc(signal));
          } while (Date.now() <= until);
        }
        record.view.note = 'Signals sent but exit not confirmed; remote state remains unknown';
      } catch { record.view.note = 'Cancellation interrupted; remote exit not confirmed'; }
      if (record.view.processState !== 'exited') record.view.processState = 'unknown';
      record.view.state = 'unknown'; record.view.active = true;
    });
  }
  async destroy(id: string, allowUnrecoveredLoss = false, signal?: AbortSignal): Promise<TaskView> {
    return this.operate(id, signal, async (client, record) => {
      if (record.view.state === 'destroyed') return;
      await this.refresh(client, record, signal);
      if (record.view.stage === 'deleted') return;
      if (!allowUnrecoveredLoss && (record.view.processState !== 'exited' || record.view.terminationConfirmed !== true || !record.view.archiveComplete || !record.patchComplete || !(await this.archiveValid(record)))) {
        throw new Error('Deletion blocked: export complete results with ax_result, or explicitly set allowUnrecoveredLoss=true');
      }
      record.view.stage = 'delete_requested';
      record.view.note = allowUnrecoveredLoss ? 'Explicit destructive deletion requested; unexported artifacts may be permanently lost' : 'Preserved-result deletion requested';
      await this.save(record);
      try {
        await client.deleteTask({ atespace: record.config.atespace, name: id }, this.rpc(signal));
        record.view.state = 'destroyed'; record.view.active = false; record.view.stage = 'deleted';
        record.view.note = allowUnrecoveredLoss ? 'AX deletion acknowledged; any unrecovered results lost. Local records retained.' : 'AX deletion acknowledged; verified local archive retained.';
      } catch {
        record.view.state = 'unknown'; record.view.note = 'Delete reply lost or failed; cleanup unknown. Query status to reconcile; do not assume deletion.';
      }
    });
  }
  async close(): Promise<void> {
    this.shutdown.abort();
    for (const client of this.clients) client.close();
    await Promise.allSettled(this.background);
    this.clients.clear();
  }
}
