import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test, { type TestContext } from 'node:test';
import { AxRpcError, type Process, type StartProcessOptions, type StreamOptions, type Task, type TaskRef } from '../src/ax/client.js';
import type { AxConfig } from '../src/config.js';
import { EgressRpcError } from '../src/ax/egress-client.js';
import { egressFixture } from './fixtures/egress-config.js';
import { TaskManager, type TaskTransport } from '../src/task-manager.js';
import { TaskStore } from '../src/task-store.js';
import { parseWorkerRequest, workerPaths, type WorkerResult } from '../src/worker-protocol.js';
import { decodeSnapshot, sha256 } from '../src/workspace.js';

// Deterministic fake transport for lifecycle tests; NOT real AX or real Pi E2E.
const config: AxConfig = { controlAddress: 'localhost:1234', routerAddress: 'localhost:1235', atespace: 'unit', workerImage: 'test:local', workerProvider: 'unit', workerModel: 'unit-model', credentialEnv: ['UNIT_KEY'] };
const secret = 'sentinel-"credential\\line\nsecret';
class FakeTransport implements TaskTransport {
  files = new Map<string, Buffer>();
  calls: string[] = [];
  process: Process = { processId: 'process-one', command: [], pid: 42, state: 'PROCESS_STATE_RUNNING', exitCode: 0, startedAt: null, finishedAt: null };
  startInput?: StartProcessOptions;
  createInput?: { ref: TaskRef; image: string };
  readyValue = true;
  startLoss = false;
  createLoss = false;
  queryLoss = false;
  deleteLoss = false;
  deleted = false;
  terminationOnStop = true;
  stopOn: 'SIGNAL_TERM' | 'SIGNAL_KILL' | null = 'SIGNAL_TERM';
  observeIntent?: (step: 'create' | 'start') => Promise<void>;
  async createTask(ref: TaskRef, image: string): Promise<Task> { this.createInput = { ref, image }; await this.observeIntent?.('create'); this.calls.push('create'); if (this.createLoss) throw new AxRpcError('CreateTask', 14); return this.task(); }
  private task(): Task { return { apiVersion: 'ax.io/v1alpha1', kind: 'Task', metadata: null, spec: null, status: null }; }
  async getTask(): Promise<Task> { if (this.deleted) throw new AxRpcError('GetTask', 5); return this.task(); }
  async resumeTask(): Promise<Task> { this.calls.push('activate'); return this.task(); }
  async ready(): Promise<boolean> { return this.readyValue; }
  async deleteTask(): Promise<void> { this.calls.push('delete'); this.deleted = true; if (this.deleteLoss) throw new AxRpcError('DeleteTask', 14); }
  async startProcess(_ref: TaskRef, input: StartProcessOptions): Promise<Process> {
    await this.observeIntent?.('start');
    this.calls.push('start'); this.startInput = input;
    if (this.startLoss) throw new AxRpcError('StartProcess', 14);
    return { ...this.process };
  }
  async getProcess(): Promise<Process> { if (this.queryLoss) throw new AxRpcError('GetProcess', 14); return { ...this.process }; }
  async signalProcess(_ref: TaskRef, _id: string, signal: 'SIGNAL_TERM' | 'SIGNAL_KILL'): Promise<Process> {
    this.calls.push(signal);
    if (this.stopOn === signal) {
      this.process = { ...this.process, state: 'PROCESS_STATE_EXITED', exitCode: signal === 'SIGNAL_TERM' ? 143 : 137 };
      if (this.terminationOnStop) this.proveTermination();
    }
    // Signal ACK itself deliberately claims running; manager must independently query exit.
    return { ...this.process, state: 'PROCESS_STATE_RUNNING' };
  }
  async *readFile(_ref: TaskRef, file: string, options?: StreamOptions): AsyncGenerator<Buffer> {
    if (options?.signal?.aborted) throw new AxRpcError('ReadFile', 1);
    const data = this.files.get(file);
    if (!data) throw new AxRpcError('ReadFile', 5);
    const split = Math.floor(data.length / 2);
    yield data.subarray(0, split); yield data.subarray(split);
  }
  async writeFile(_ref: TaskRef, file: string, data: Uint8Array | AsyncIterable<Uint8Array>): Promise<{ bytesWritten: string }> {
    assert(data instanceof Uint8Array);
    this.calls.push(`write:${file}`); this.files.set(file, Buffer.from(data));
    return { bytesWritten: String(data.length) };
  }
  close(): void {}
  proveTermination(): void {
    const request = parseWorkerRequest(this.files.get(workerPaths().request)!);
    this.files.set(workerPaths().termination, Buffer.from(JSON.stringify({ version: 1, taskId: request.taskId,
      snapshotSha256: request.snapshotSha256, finishedAt: new Date().toISOString(), piExitCode: 0, piSignal: null, interrupted: false })));
  }
  finish(outcome: WorkerResult['outcome'] = 'completed', patchComplete = true): void {
    const request = parseWorkerRequest(this.files.get(workerPaths().request)!);
    const patch = Buffer.from('diff --git a/deleted.txt b/deleted.txt\ndeleted file mode 100644\n--- a/deleted.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\ndiff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+new\n');
    const values = [
      { name: 'events.jsonl' as const, data: Buffer.from(JSON.stringify({ type: 'tool_execution_end', text: secret }) + '\n') },
      { name: 'stderr.log' as const, data: Buffer.from(`stderr ${secret}`) },
      ...(patchComplete ? [{ name: 'changes.patch' as const, data: patch }] : []),
    ];
    for (const file of values) this.files.set(path.join(workerPaths().artifacts, file.name), file.data);
    const manifest: WorkerResult = { version: 1, taskId: request.taskId, snapshotSha256: request.snapshotSha256,
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), outcome, piExitCode: outcome === 'failed' ? 1 : 0,
      piSignal: null, agentSettled: true, finalStopReason: outcome === 'failed' ? 'error' : 'stop', finalText: `done ${secret}`,
      logsTruncated: false, patchComplete, issues: outcome === 'completed' ? [] : ['fixture outcome'],
      artifacts: values.map((f) => ({ name: f.name, bytes: f.data.length, sha256: sha256(f.data) })) };
    this.files.set(workerPaths().result, Buffer.from(JSON.stringify(manifest)));
    this.proveTermination();
    this.process = { ...this.process, state: 'PROCESS_STATE_EXITED', exitCode: outcome === 'failed' ? 1 : 0 };
  }
}
async function setup(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-manager-'));
  const cwd = path.join(root, 'input');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(cwd); await writeFile(path.join(cwd, 'deleted.txt'), 'old\n');
  const fake = new FakeTransport();
  const store = new TaskStore(path.join(root, 'state'));
  const configured = { ...config, egress: egressFixture(root) };
  const policy = { async createPolicy(actor: TaskRef) {
    fake.calls.push('policy');
    const record = await store.read(actor.name);
    assert.equal(record.view.stage, 'egress_policy_requested');
    return { actor, name: 'default' as const, uid: 'test-uid', version: '1', cidrs: [...configured.egress.cidrs] };
  }, async getPolicy() { throw new Error('No implicit GET'); }, close() {} };
  const options = { store, config: () => configured, egressClient: () => policy, environment: { UNIT_KEY: secret, NOT_ALLOWED: 'never-copy' }, transport: () => fake, pollMs: 1, cancelGraceMs: 1, cancelKillMs: 1 };
  const manager = new TaskManager(options);
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  return { root, cwd, fake, store, options, manager, policy };
}
async function launched(store: TaskStore, id: string) {
  for (let i = 0; i < 200; i++) {
    const r = await store.read(id);
    if (r.view.stage === 'started' || r.view.state === 'unknown') { await delay(30); return r; }
    await delay(5);
  }
  throw new Error('Fixture launch did not settle');
}

test('async persisted acceptance, pending readiness, one-active enforcement and shutdown leave discoverable work', async (t) => {
  const { manager, fake, store, cwd, options } = await setup(t);
  fake.readyValue = false;
  const accepted = await manager.spawn('change source', cwd);
  assert.equal(accepted.state, 'pending'); assert.equal(accepted.processId, null);
  assert.equal((await store.read(accepted.taskId)).view.taskId, accepted.taskId);
  const pending = await manager.status(accepted.taskId);
  assert.equal(pending[0].state, 'pending');
  await assert.rejects(manager.spawn('duplicate', cwd), /One active task/);
  await manager.close();
  const restarted = new TaskManager(options); t.after(() => restarted.close());
  const [unknown] = await restarted.status(accepted.taskId);
  assert.equal(unknown.state, 'unknown'); assert.equal(unknown.active, true);
  assert.equal(fake.calls.includes('delete'), false); assert.equal(fake.calls.includes('SIGNAL_TERM'), false);
  assert.equal(fake.calls.filter((v) => v === 'create').length, 1);
});

test('normal result archives exact additions/deletions patch, redacted logs, actual state and survives restart/deletion', async (t) => {
  const { manager, fake, store, cwd, options } = await setup(t);
  const intents: string[] = [];
  fake.observeIntent = async (step) => {
    const [record] = await store.list();
    intents.push(`${step}:${record.view.stage}:${record.remoteAttempted}:${record.startAttempted}`);
    assert.equal(record.view.processId, null);
  };
  const accepted = await manager.spawn('change source', cwd);
  await launched(store, accepted.taskId);
  assert.deepEqual(fake.calls.slice(0, 6), ['create', 'policy', 'activate', `write:${workerPaths().snapshot}`, `write:${workerPaths().request}`, 'start']);
  assert.deepEqual(intents, ['create:create_requested:true:false', 'start:start_requested:true:true']);
  assert.equal(fake.startInput?.timeoutSeconds, 900);
  assert.deepEqual({ ...fake.startInput?.env }, { UNIT_KEY: secret });
  assert.equal((await manager.status(accepted.taskId))[0].state, 'running');
  fake.finish();
  await manager.close();
  const restarted = new TaskManager({ ...options, config: () => { throw new Error('current config not needed for retained task'); } }); t.after(() => restarted.close());
  const [status] = await restarted.status(accepted.taskId);
  assert.equal(status.state, 'completed'); assert.equal(status.exitCode, 0); assert.equal(status.active, false);
  await assert.rejects(restarted.destroy(accepted.taskId), /Deletion blocked/);
  const result = await restarted.result(accepted.taskId);
  assert.equal(result.archiveComplete, true);
  assert.deepEqual(await readFile(result.patchPath!), fake.files.get(workerPaths().patch));
  for (const file of ['result.json', 'events.jsonl', 'stderr.log']) {
    const text = await readFile(path.join(result.archiveDirectory!, file), 'utf8');
    assert(!text.includes(secret)); assert(!text.includes(JSON.stringify(secret).slice(1, -1))); assert(text.includes('[REDACTED]'));
    assert.equal((await stat(path.join(result.archiveDirectory!, file))).mode & 0o777, 0o600);
  }
  const diskRecord = await readFile(path.join(store.directory(accepted.taskId), 'task.json'), 'utf8');
  assert(!diskRecord.includes(secret)); assert(!diskRecord.includes('never-copy'));
  assert(!diskRecord.includes('synthetic-policy-sentinel'));
  assert.deepEqual((await store.read(accepted.taskId)).config.egress, options.config().egress);
  assert.equal((await stat(result.archiveDirectory!)).mode & 0o777, 0o700);
  assert.equal(await readFile(path.join(cwd, 'deleted.txt'), 'utf8'), 'old\n');
  assert.equal((await restarted.destroy(accepted.taskId)).state, 'destroyed');
  assert.equal((await restarted.result(accepted.taskId)).archiveComplete, true);
  assert.equal((await restarted.status())[0].state, 'destroyed');
});

test('wrapper failure and confirmed exit differ from absent manifest and advisory timeout', async (t) => {
  const { manager, fake, store, cwd } = await setup(t);
  const { taskId } = await manager.spawn('fail', cwd); await launched(store, taskId);
  const r = await store.read(taskId); r.view.deadlineAt = new Date(0).toISOString(); await store.write(r);
  let [view] = await manager.status(taskId);
  assert.equal(view.state, 'running'); assert.equal(view.deadlineExceeded, true); assert.equal(fake.calls.includes('SIGNAL_KILL'), false);
  fake.process.state = 'PROCESS_STATE_EXITED'; fake.process.exitCode = 137;
  [view] = await manager.status(taskId);
  assert.equal(view.state, 'unknown'); assert.equal(view.active, true); assert.equal(view.processState, 'exited'); assert.equal(view.cancellationConfirmed, false);
  fake.proveTermination();
  [view] = await manager.status(taskId); assert.equal(view.state, 'incomplete'); assert.equal(view.active, false);
  fake.finish('failed');
  // The guest exit observation is monotonic; the original 137 remains evidence, not a timeout label.
  [view] = await manager.status(taskId); assert.equal(view.state, 'failed'); assert.equal(view.exitCode, 137);
});

test('lost StartProcess reply is unknown after restart, never retried even with completed manifest', async (t) => {
  const { manager, fake, store, cwd, options } = await setup(t);
  fake.startLoss = true;
  const { taskId } = await manager.spawn('change', cwd); await launched(store, taskId);
  fake.finish(); await manager.close();
  const restarted = new TaskManager(options); t.after(() => restarted.close());
  const [view] = await restarted.status(taskId);
  assert.equal(view.state, 'unknown'); assert.equal(view.active, true); assert.equal(view.processId, null);
  const result = await restarted.result(taskId); assert.equal(result.archiveComplete, false); assert(result.patchPath);
  await assert.rejects(restarted.spawn('do not duplicate', cwd), /One active task/);
  const cancel = await restarted.cancel(taskId); assert.equal(cancel.state, 'unknown');
  assert.equal(fake.calls.filter((v) => v === 'start').length, 1);
  await assert.rejects(restarted.destroy(taskId), /Deletion blocked/);
  assert.equal((await restarted.destroy(taskId, true)).state, 'destroyed');
});

test('lost CreateTask reply retains unique external identity without activation/retry', async (t) => {
  const { manager, fake, store, cwd } = await setup(t); fake.createLoss = true;
  const { taskId } = await manager.spawn('change', cwd); await launched(store, taskId);
  const [view] = await manager.status(taskId); assert.equal(view.state, 'unknown'); assert.equal(view.remote, `unit/${taskId}`);
  assert.deepEqual(fake.calls, ['create']);
});

test('TERM then KILL confirms exit through GetProcess, preserves partial results and guards deletion', async (t) => {
  const { manager, fake, store, cwd } = await setup(t); fake.stopOn = 'SIGNAL_KILL';
  const { taskId } = await manager.spawn('long task', cwd); await launched(store, taskId);
  fake.files.set(workerPaths().events, Buffer.from('partial\n')); fake.files.set(workerPaths().stderr, Buffer.from(`partial ${secret}`));
  const cancelled = await manager.cancel(taskId);
  assert.deepEqual(fake.calls.filter((v) => v.startsWith('SIGNAL')), ['SIGNAL_TERM', 'SIGNAL_KILL']);
  assert.equal(cancelled.state, 'cancelled'); assert.equal(cancelled.cancellationConfirmed, true); assert.equal(cancelled.exitCode, 137);
  const result = await manager.result(taskId); assert.equal(result.archiveComplete, false);
  assert.equal(await readFile(path.join(result.archiveDirectory!, 'events.jsonl'), 'utf8'), 'partial\n');
  await assert.rejects(manager.destroy(taskId), /Deletion blocked/);
  assert.equal(fake.calls.includes('delete'), false);
});

test('signal acknowledgement without observed exit and unreachable guest cannot imply cancellation', async (t) => {
  const { manager, fake, store, cwd } = await setup(t); fake.stopOn = null;
  const { taskId } = await manager.spawn('long task', cwd); await launched(store, taskId);
  let result = await manager.cancel(taskId); assert.equal(result.state, 'unknown'); assert.equal(result.cancellationConfirmed, false); assert.equal(result.active, true);
  fake.queryLoss = true;
  result = await manager.cancel(taskId); assert.equal(result.state, 'unknown'); assert.equal(result.cancellationConfirmed, false);
});

test('local tool abort never signals or deletes the guest', async (t) => {
  const { manager, fake, store, cwd } = await setup(t);
  const { taskId } = await manager.spawn('long task', cwd); await launched(store, taskId);
  const signal = AbortSignal.abort();
  await assert.rejects(manager.cancel(taskId, signal), /Local operation aborted/);
  assert.equal(fake.calls.some((v) => v.startsWith('SIGNAL') || v === 'delete'), false);
  assert.equal((await manager.status(taskId))[0].state, 'running');
});

test('artifact corruption, incomplete patch and local archive tampering block safe deletion', async (t) => {
  const { manager, fake, store, cwd } = await setup(t);
  const { taskId } = await manager.spawn('change', cwd); await launched(store, taskId); fake.finish();
  const patch = fake.files.get(workerPaths().patch)!;
  fake.files.set(workerPaths().patch, Buffer.from('corrupt'));
  assert.equal((await manager.result(taskId)).archiveComplete, false);
  await assert.rejects(manager.destroy(taskId), /Deletion blocked/);
  fake.files.set(workerPaths().patch, patch);
  const exported = await manager.result(taskId); assert.equal(exported.archiveComplete, true);
  await writeFile(exported.patchPath!, 'tampered');
  await assert.rejects(manager.destroy(taskId), /Deletion blocked/);
  fake.finish('incomplete', false);
  assert.equal((await manager.result(taskId)).archiveComplete, true);
  await assert.rejects(manager.destroy(taskId), /Deletion blocked/);
});

test('manifest correlation mismatch cannot claim outcome or export complete result', async (t) => {
  const { manager, fake, store, cwd } = await setup(t);
  const { taskId } = await manager.spawn('change', cwd); await launched(store, taskId); fake.finish();
  const manifest = JSON.parse(fake.files.get(workerPaths().result)!.toString()) as WorkerResult;
  manifest.snapshotSha256 = 'a'.repeat(64); fake.files.set(workerPaths().result, Buffer.from(JSON.stringify(manifest)));
  assert.equal((await manager.status(taskId))[0].state, 'incomplete');
  assert.equal((await manager.result(taskId)).archiveComplete, false);
});

test('delete reply loss remains unknown and reconciles only after AX NotFound', async (t) => {
  const { manager, fake, store, cwd } = await setup(t);
  const { taskId } = await manager.spawn('change', cwd); await launched(store, taskId); fake.deleteLoss = true;
  const result = await manager.destroy(taskId, true); assert.equal(result.state, 'unknown');
  fake.deleted = false;
  assert.equal((await manager.status(taskId))[0].state, 'unknown');
  fake.deleted = true;
  assert.equal((await manager.result(taskId)).state, 'destroyed');
  assert.equal((await manager.destroy(taskId, true)).state, 'destroyed');
  assert.equal(fake.calls.filter((c) => c === 'delete').length, 1);
});

test('missing credentials fail before reservation; unknown IDs do not create broken records', async (t) => {
  const { options, cwd, store } = await setup(t);
  const manager = new TaskManager({ ...options, environment: {} }); t.after(() => manager.close());
  await assert.rejects(manager.spawn('change', cwd), /Missing or invalid configured credential/);
  assert.deepEqual(await store.list(), []);
  const missing = 'ax-00000000-0000-0000-0000-000000000000';
  await assert.rejects(manager.result(missing));
  assert.deepEqual(await readdir(store.root), []);
  const before = await readdir(cwd, { recursive: true });
  const alias = path.join(path.dirname(cwd), 'source-alias'); await symlink(cwd, alias);
  for (const root of [path.join(cwd, 'new', '.pi-ax'), path.join(alias, 'missing', 'state')]) {
    const nested = new TaskManager({ ...options, store: new TaskStore(root) }); t.after(() => nested.close());
    await assert.rejects(nested.spawn('change', cwd), /outside the snapshot/);
    assert.deepEqual(await readdir(cwd, { recursive: true }), before);
    await assert.rejects(stat(root), { code: 'ENOENT' });
  }
});

test('wrapper exit without correlated descendant proof retains reservation and cannot confirm cancellation/export', async (t) => {
  const { manager, fake, store, cwd, options } = await setup(t); fake.terminationOnStop = false;
  const { taskId } = await manager.spawn('long task', cwd); await launched(store, taskId);
  let view = await manager.cancel(taskId);
  assert.equal(view.processState, 'exited'); assert.equal(view.state, 'unknown');
  assert.equal(view.active, true); assert.equal(view.cancellationConfirmed, false);
  fake.finish(); fake.files.delete(workerPaths().termination); // Even a completed Pi manifest is insufficient.
  view = await manager.result(taskId); assert.equal(view.state, 'unknown'); assert.equal(view.archiveComplete, false);
  await assert.rejects(manager.spawn('duplicate', cwd), /One active task/);
  await assert.rejects(manager.destroy(taskId), /Deletion blocked/);
  await manager.close();
  const restarted = new TaskManager(options); t.after(() => restarted.close());
  fake.proveTermination();
  const proof = JSON.parse(fake.files.get(workerPaths().termination)!.toString()) as { taskId: string };
  proof.taskId = 'another-task'; fake.files.set(workerPaths().termination, Buffer.from(JSON.stringify(proof)));
  view = (await restarted.status(taskId))[0]; assert.equal(view.state, 'unknown'); assert.equal(view.active, true);
  fake.proveTermination();
  view = (await restarted.status(taskId))[0];
  assert.equal(view.active, false); assert.equal(view.cancellationConfirmed, true); assert.equal(view.terminationConfirmed, true);
  assert.equal((await restarted.result(taskId)).archiveComplete, true);
  assert.equal(fake.calls.filter((call) => call === 'start').length, 1);
});

test('legacy v1 wrapper-only completion cannot free the active slot before status reconciliation', async (t) => {
  const { manager, fake, store, cwd } = await setup(t);
  const { taskId } = await manager.spawn('change', cwd); await launched(store, taskId); fake.finish();
  const record = await store.read(taskId);
  delete record.view.terminationConfirmed;
  record.view.state = 'completed'; record.view.processState = 'exited'; record.view.active = false;
  record.view.archiveComplete = true; record.view.cancellationConfirmed = true;
  await store.write(record); fake.files.delete(workerPaths().termination);
  await assert.rejects(manager.spawn('duplicate', cwd), /One active task/);
  const migrated = await store.read(taskId);
  assert.equal(migrated.view.state, 'unknown'); assert.equal(migrated.view.active, true);
  assert.equal(migrated.view.archiveComplete, false); assert.equal(migrated.view.cancellationConfirmed, false);
});

test('missing, invalid or unreadable egress fails before snapshot, reservation and remote effects', async (t) => {
  const { options, store, fake, root } = await setup(t);
  for (const egress of [undefined, { ...options.config().egress, cidrs: ['0.0.0.0/0'] },
    { ...options.config().egress, bearerTokenFile: path.join(root, 'missing-token') }]) {
    const manager = new TaskManager({ ...options, config: () => ({ ...options.config(), egress }) });
    await assert.rejects(manager.spawn('not snapshotted', path.join(root, 'nonexistent-input')), /egress/i);
    await manager.close();
  }
  assert.deepEqual(fake.calls, []);
  await assert.rejects(stat(store.root), { code: 'ENOENT' });
});

for (const failure of ['permission', 'lost-reply', 'conflict', 'wrong-actor', 'wrong-cidrs'] as const) {
  test(`egress ${failure} retains unknown intent without activation, upload, start or replay`, async (t) => {
    const { options, manager, store, cwd, fake, policy } = await setup(t);
    const original = policy.createPolicy.bind(policy);
    policy.createPolicy = async (actor) => {
      const response = await original(actor);
      if (failure === 'wrong-actor') return { ...response, actor: { ...actor, name: 'wrong' } };
      if (failure === 'wrong-cidrs') return { ...response, cidrs: ['192.0.2.98/32'] };
      throw new EgressRpcError('CreateActorEgressPolicy', failure === 'permission' ? 7 : failure === 'conflict' ? 6 : 14);
    };
    const { taskId } = await manager.spawn('blocked', cwd);
    const record = await launched(store, taskId);
    assert.equal(record.view.stage, 'egress_policy_requested');
    assert.equal(record.view.state, 'unknown'); assert.equal(record.view.active, true);
    assert.equal(record.startAttempted, false);
    await manager.close();
    const restarted = new TaskManager({ ...options, egressClient: () => { throw new Error('policy must not be retried'); } });
    t.after(() => restarted.close());
    assert.equal((await restarted.status(taskId))[0].state, 'unknown');
    assert.equal((await restarted.cancel(taskId)).cancellationConfirmed, false);
    await assert.rejects(restarted.destroy(taskId), /Deletion blocked/);
    assert.deepEqual(fake.calls, ['create', 'policy']);
  });
}

test('legacy records manage status/result/cancel/destroy without egress configuration or secret reads', async (t) => {
  const { manager, options, store, cwd, root, fake } = await setup(t);
  const { taskId } = await manager.spawn('legacy fixture', cwd); await launched(store, taskId);
  fake.finish(); await manager.close();
  const record = await store.read(taskId); delete record.config.egress; await store.write(record);
  await rm(path.join(root, 'test-token')); await rm(path.join(root, 'test-ca.pem'));
  const restarted = new TaskManager({ ...options, config: () => { throw new Error('cold current config'); },
    egressClient: () => { throw new Error('legacy must not access policy credentials'); } });
  t.after(() => restarted.close());
  assert.equal((await restarted.status(taskId))[0].state, 'completed');
  assert.equal((await restarted.cancel(taskId)).terminationConfirmed, true);
  assert.equal((await restarted.result(taskId)).archiveComplete, true);
  assert.equal((await restarted.destroy(taskId)).state, 'destroyed');
  assert.equal(fake.calls.filter((call) => call === 'policy').length, 1);
});

for (const location of ['ordinary-name', 'configured-symlink', 'hardlink-alias', 'excluded-cache'] as const) {
  test(`spawn protects native bearer file identity at snapshot boundary: ${location}`, async (t) => {
    const { manager, options, store, cwd, root, fake } = await setup(t);
    const sentinel = 'synthetic-scoped-native-token-must-not-export';
    const included = path.join(cwd, 'ordinary-data');
    let configured = included;
    if (location === 'excluded-cache') {
      configured = path.join(cwd, '.cache', 'bootstrap', 'token');
      await mkdir(path.dirname(configured), { recursive: true });
    }
    if (location === 'hardlink-alias') configured = path.join(root, 'external-token');
    await writeFile(configured, sentinel, { mode: 0o600 });
    if (location === 'configured-symlink') {
      configured = path.join(root, 'configured-token-link');
      await symlink(included, configured);
    }
    if (location === 'hardlink-alias') await link(configured, included);
    options.config().egress.bearerTokenFile = configured;
    if (location !== 'excluded-cache') {
      await assert.rejects(manager.spawn('snapshot boundary', cwd), /protected file/i);
      // No task directory means no task.json, snapshot.json or request.json was persisted.
      assert.deepEqual(await readdir(store.root), []);
      assert.deepEqual(fake.calls, []); assert.equal(fake.files.size, 0);
      assert.equal(fake.startInput, undefined); assert.equal(fake.createInput, undefined);
    } else {
      const { taskId } = await manager.spawn('snapshot boundary', cwd); await launched(store, taskId);
      const local = await readFile(path.join(store.directory(taskId), 'snapshot.json'));
      const uploaded = fake.files.get(workerPaths().snapshot)!;
      assert.deepEqual(uploaded, local);
      for (const bytes of [local, uploaded]) {
        const files = decodeSnapshot(bytes).files;
        assert.deepEqual(files.map((f) => f.path), ['deleted.txt']);
        for (const file of files) assert(!Buffer.from(file.data, 'base64').includes(sentinel));
      }
      for (const file of ['task.json', 'request.json']) assert(!(await readFile(path.join(store.directory(taskId), file), 'utf8')).includes(sentinel));
      assert(!JSON.stringify(fake.createInput).includes(sentinel));
      assert(!JSON.stringify(fake.startInput).includes(sentinel));
      assert.deepEqual({ ...fake.startInput?.env }, { UNIT_KEY: secret });
    }
    assert.equal(await readFile(configured, 'utf8'), sentinel, 'user token is not rewritten');
  });
}

for (const failure of ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'UNKNOWN', 'UNAVAILABLE', 'untyped-secret-error'] as const) {
  test(`policy diagnostic survives status and restart without secret details: ${failure}`, async (t) => {
    const { manager, options, policy, fake, store, cwd } = await setup(t);
    const rawSecret = 'synthetic-error-detail-never-persist';
    const code = { UNAUTHENTICATED: 16, PERMISSION_DENIED: 7, UNKNOWN: 2, UNAVAILABLE: 14, 'untyped-secret-error': 16 }[failure];
    policy.createPolicy = async () => {
      fake.calls.push('policy');
      const error = failure === 'untyped-secret-error'
        ? Object.assign(new Error(rawSecret), { code, operation: 'CreateActorEgressPolicy' })
        : new EgressRpcError('CreateActorEgressPolicy', code);
      error.message = rawSecret;
      Object.assign(error, { cause: new Error(rawSecret), metadata: { details: rawSecret } });
      throw error;
    };
    const { taskId } = await manager.spawn('diagnose binding', cwd);
    const launchedRecord = await launched(store, taskId);
    const expected = failure === 'untyped-secret-error' ? 'UNKNOWN' : failure;
    const note = launchedRecord.view.note;
    assert.match(note, new RegExp(`CreateActorEgressPolicy: ${expected}(?:[.;]|$)`));
    assert.equal(note.includes('Refresh approved bootstrap credentials'), failure === 'UNAUTHENTICATED');
    if (failure !== 'UNAUTHENTICATED') assert(!note.includes('UNAUTHENTICATED'));
    for (let i = 0; i < 2; i++) assert.equal((await manager.status(taskId))[0].note, note);
    await manager.close();
    const restarted = new TaskManager({ ...options, config: () => { throw new Error('retained configuration only'); },
      egressClient: () => { throw new Error('no policy retries or credential reads'); } });
    t.after(() => restarted.close());
    for (let i = 0; i < 2; i++) {
      const [view] = await restarted.status(taskId);
      assert.equal(view.note, note); assert.equal(view.state, 'unknown'); assert.equal(view.active, true);
      assert.equal(view.stage, 'egress_policy_requested'); assert.equal(view.processId, null);
    }
    const persisted = await store.read(taskId);
    assert.equal(persisted.startAttempted, false);
    assert(!(await readFile(path.join(store.directory(taskId), 'task.json'), 'utf8')).includes(rawSecret));
    assert.deepEqual(fake.calls, ['create', 'policy']);
    // A later unknown execution must not inherit a definitive old authentication claim.
    persisted.startAttempted = true; persisted.view.stage = 'start_requested'; await store.write(persisted);
    const [later] = await restarted.status(taskId);
    assert(!later.note.includes('CreateActorEgressPolicy')); assert(!later.note.includes('UNAUTHENTICATED'));
    assert.equal(later.state, 'unknown'); assert.equal(later.active, true);
  });
}
