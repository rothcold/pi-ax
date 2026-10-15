import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { runSqlite, runWire } from '../scripts/e2e.js';
import { AxTransport, AxRpcError, type TaskRef, type Task, type Process } from '../src/ax/client.js';
import type { AxConfig } from '../src/config.js';
import { TaskManager } from '../src/task-manager.js';
import type { EvidenceSave } from '../scripts/e2e-lifecycle.js';
import type { RuntimeEvidence } from '../scripts/e2e-native-evidence.js';
import { parseWorkerRequest, workerPaths, type WorkerResult } from '../src/worker-protocol.js';
import { sha256 } from '../src/workspace.js';
import { egressFixture } from './fixtures/egress-config.js';

const config: AxConfig = { controlAddress: '127.0.0.1:1', routerAddress: '127.0.0.1:2', atespace: 'test', workerImage: 'fixture:image', workerProvider: 'fixture', workerModel: 'fixture', credentialEnv: [] };
// These are local harness fixtures, not AX/model/runtime acceptance.
class HarnessTransport extends AxTransport {
  calls: string[] = [];
  remoteFiles = new Map<string, Buffer>();
  task: Task = { apiVersion: '', kind: '', metadata: null, spec: null, status: null };
  observedProcess: Process = { processId: 'fixture-process', command: [], pid: 42, state: 'PROCESS_STATE_EXITED', exitCode: 0, startedAt: null, finishedAt: null };
  mode: 'wire' | 'sqlite' = 'wire';
  failure: 'none' | 'model' | 'export' | 'termination' | 'start' | 'delete' = 'none';
  inspectCreate?: () => Promise<void>;
  inspectDelete?: () => Promise<void>;
  constructor() { super(config); }
  override async createTask(): Promise<Task> { await this.inspectCreate?.(); this.calls.push('create'); return this.task; }
  override async resumeTask(): Promise<Task> { this.calls.push('activate'); return this.task; }
  override async ready() { return true; }
  override async writeFile(_ref: TaskRef, file: string, data: Uint8Array | AsyncIterable<Uint8Array>) { assert(data instanceof Uint8Array); this.remoteFiles.set(file, Buffer.from(data)); return { bytesWritten: String(data.length) }; }
  override async *readFile(_ref: TaskRef, file: string) {
    if ((this.failure === 'export' && file.endsWith('events.jsonl')) || (this.failure === 'termination' && file.endsWith('termination.json'))) throw new AxRpcError('ReadFile', 5);
    const data = this.remoteFiles.get(file); if (!data) throw new AxRpcError('ReadFile', 5); yield data;
  }
  override async startProcess(): Promise<Process> {
    this.calls.push('start'); if (this.failure === 'start') throw new AxRpcError('StartProcess', 14);
    if (this.mode === 'sqlite') {
      const req = parseWorkerRequest(this.remoteFiles.get(workerPaths().request)!);
      const artifacts = [
        { name: 'events.jsonl' as const, data: Buffer.from(JSON.stringify({ type: 'tool_execution_end', toolName: 'bash', isError: false, result: 'PI_AX_SQLITE_CRUD_OK' }) + '\n') },
        { name: 'stderr.log' as const, data: Buffer.from('fixture stderr') },
        { name: 'changes.patch' as const, data: Buffer.from('diff --git a/crud.py b/crud.py\nnew file mode 100644\ndeleted file mode 100644\n') },
      ];
      for (const a of artifacts) this.remoteFiles.set(path.join(workerPaths().artifacts, a.name), a.data);
      const result: WorkerResult = { version: 1, taskId: req.taskId, snapshotSha256: req.snapshotSha256, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), outcome: this.failure === 'model' ? 'failed' : 'completed', piExitCode: this.failure === 'model' ? 1 : 0, piSignal: null, agentSettled: true, finalStopReason: 'stop', finalText: 'fixture', logsTruncated: false, patchComplete: true, issues: [], artifacts: artifacts.map((a) => ({ name: a.name, bytes: a.data.length, sha256: sha256(a.data) })) };
      this.remoteFiles.set(workerPaths().result, Buffer.from(JSON.stringify(result)));
      this.remoteFiles.set(workerPaths().termination, Buffer.from(JSON.stringify({ version: 1, taskId: req.taskId, snapshotSha256: req.snapshotSha256, finishedAt: new Date().toISOString(), piExitCode: result.piExitCode, piSignal: null, interrupted: false })));
    }
    return { ...this.observedProcess, exitCode: this.failure === 'model' ? 1 : 0 };
  }
  override async getProcess() { return { ...this.observedProcess, exitCode: this.failure === 'model' ? 1 : 0 }; }
  override async *streamProcessOutput() { yield { stdout: Buffer.from(JSON.stringify({ pi: '1.0.0', builtPi: '1.0.0', sha256: sha256(this.remoteFiles.get('/workspace/pi-ax-probe.bin')!) })), stderr: undefined, exit: undefined }; }
  override async deleteTask() { await this.inspectDelete?.(); this.calls.push('delete'); if (this.failure === 'delete') throw new AxRpcError('DeleteTask', 14); }
  override close() { super.close(); }
}

async function capture(_config: AxConfig, _transport: AxTransport, ref: TaskRef, save: EvidenceSave): Promise<RuntimeEvidence> {
  const template = { ref: { atespace: ref.atespace, name: `${ref.name}-tmpl-12345678` }, uid: '12345678-1234-1234-1234-123456789abc', images: ['fixture:image'], sandboxClass: 'SANDBOX_CLASS_GVISOR', goldenSnapshotFailed: false };
  const evidence = { actor: { ref, uid: '22345678-1234-1234-1234-123456789abc', template: template.ref, templateUid: template.uid, state: 'ACTOR_STATE_RUNNING', assignment: null }, template, goldenRef: { atespace: 'ate-golden', name: template.uid }, golden: null };
  await save('ax-evidence.json', { ref }); await save('native-evidence.json', evidence); return evidence;
}

test('wire entry path persists ID/start intent, archives failed checks, binds policy and deletes only after archive', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-wire-harness-')); t.after(() => rm(root, { recursive: true, force: true }));
  const configured = { ...config, egress: egressFixture(root) };
  for (const failure of ['none', 'model', 'start', 'delete'] as const) {
    const fake = new HarnessTransport(); fake.failure = failure;
    const ownership = path.join(root, failure); const output = path.join(root, `${failure}-output`);
    fake.inspectCreate = async () => { const intent = JSON.parse(await readFile(path.join(ownership, 'owner.json'), 'utf8')); assert.match(intent.identity.ref.name, /^pi-ax-probe-/); assert.equal(intent.stage, 'intent');
      const expectedScope = { version: 1, address: configured.egress.address, serverName: configured.egress.serverName, caSha256: sha256(await readFile(configured.egress.caFile)) };
      assert.deepEqual(intent.identity.nativeScope, expectedScope);
      assert.deepEqual(JSON.parse(await readFile(path.join(output, 'intent.json'), 'utf8')).identity.nativeScope, expectedScope);
    };
    fake.inspectDelete = async () => { assert.equal(JSON.parse(await readFile(path.join(output, 'archive.json'), 'utf8')).complete, true); await readFile(path.join(output, 'native-evidence.json')); await readFile(path.join(output, 'stderr.log')); };
    let confirmed = false;
    const deps = { transport: fake, async bindPolicy() { fake.calls.push('policy'); }, capture,
      async confirm() { confirmed = true; },
      async supervision(_transport: AxTransport, _ref: TaskRef, output: string) {
        for (const name of ['supervision-intent.json', 'supervision-process.json', 'supervision-termination.json', 'supervision-passed.json']) await writeFile(path.join(output, name), '{}');
      },
    };
    const run = runWire(configured, output, ownership, deps);
    if (failure === 'none') await run; else await assert.rejects(run);
    assert.deepEqual(fake.calls.slice(0, 3), ['create', 'policy', 'activate']);
    assert.equal(fake.calls.includes('delete'), failure !== 'start');
    assert.equal(confirmed, failure === 'none' || failure === 'model');
    await readFile(path.join(output, 'process-intent.json')); await readFile(path.join(output, 'diagnostic.json'));
    if (failure === 'start' || failure === 'delete') await assert.rejects(runWire(configured, path.join(root, `${failure}-other`), ownership, deps), /unresolved/);
  }
});

test('SQLite entry uses real manager persistence/export/restart: failed model cleans, uncertainty blocks wire', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-sqlite-harness-')); t.after(() => rm(root, { recursive: true, force: true }));
  const configured = { ...config, egress: egressFixture(root) };
  for (const failure of ['none', 'model', 'export', 'termination', 'start', 'delete'] as const) {
    const fake = new HarnessTransport(); fake.mode = 'sqlite'; fake.failure = failure;
    const ownership = path.join(root, failure); const output = path.join(root, `${failure}-output`);
    let managers = 0;
    fake.inspectCreate = async () => {
      const intent = JSON.parse(await readFile(path.join(ownership, 'owner.json'), 'utf8'));
      assert.equal(intent.identity.stateDir, path.join(output, 'state'));
      const expectedScope = { version: 1, address: configured.egress.address, serverName: configured.egress.serverName, caSha256: sha256(await readFile(configured.egress.caFile)) };
      assert.deepEqual(intent.identity.nativeScope, expectedScope);
      assert.deepEqual(JSON.parse(await readFile(path.join(output, 'intent.json'), 'utf8')).identity.nativeScope, expectedScope);
    };
    fake.inspectDelete = async () => { const manifest = JSON.parse(await readFile(path.join(output, 'archive.json'), 'utf8')); assert.equal(manifest.complete, true); assert(manifest.files.some((f: { name: string }) => f.name.endsWith('/termination.json'))); };
    const run = runSqlite(configured, output, ownership, { transport: fake, capture, async confirm() {},
      manager(options) {
        managers++;
        return new TaskManager({ ...options, transport: () => fake, environment: {}, pollMs: 1,
          egressClient: () => ({ async createPolicy(actor) { return { actor, name: 'default', uid: 'fixture-uid', version: '1', cidrs: configured.egress.cidrs }; }, async getPolicy() { throw new Error('No implicit get'); }, close() {} }),
        });
      },
    });
    if (failure === 'none') await run; else await assert.rejects(run);
    assert.equal(fake.calls.filter((c) => c === 'create').length, 1);
    assert.equal(fake.calls.filter((c) => c === 'start').length, 1);
    assert.equal(fake.calls.includes('delete'), ['none', 'model', 'delete'].includes(failure));
    assert.equal(await readFile(path.join(output, 'input/keep.txt'), 'utf8'), 'uncommitted input\n');
    assert.equal(await readFile(path.join(output, 'input/delete-me.txt'), 'utf8'), 'delete this file\n');
    await readFile(path.join(output, 'result-view.json')); await readFile(path.join(output, 'status.json'));
    if (failure === 'model') assert.equal(JSON.parse(await readFile(path.join(output, 'check-status.json'), 'utf8')).check, 'sqlite_worker_outcome_and_archive');
    if (failure !== 'start') assert.equal(managers, 2, 'Manager recreated for retrieval');
    if (!['none', 'model'].includes(failure)) await assert.rejects(runWire(configured, path.join(root, `${failure}-wire`), ownership), /unresolved/);
  }
});

test('both E2E entry paths retain archived ownership and never delete after native scope retargeting', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-native-retarget-')); t.after(() => rm(root, { recursive: true, force: true }));
  const egress = egressFixture(root);
  for (const mode of ['wire', 'sqlite'] as const) {
    const configured = { ...config, egress: { ...egress } };
    const fake = new HarnessTransport(); fake.mode = mode;
    const ownership = path.join(root, mode); const output = path.join(root, `${mode}-output`);
    let confirmed = false;
    const deps = { transport: fake, async bindPolicy() {},
      async capture(c: AxConfig, transport: AxTransport, ref: TaskRef, save: EvidenceSave) {
        const evidence = await capture(c, transport, ref, save);
        configured.egress.address = '127.0.0.1:54321'; // Same AX/router, unrelated native service.
        return evidence;
      },
      async confirm() { confirmed = true; },
      async supervision(_transport: AxTransport, _ref: TaskRef, output: string) {
        for (const name of ['supervision-intent.json', 'supervision-process.json', 'supervision-termination.json', 'supervision-passed.json']) await writeFile(path.join(output, name), '{}');
      },
      manager(options: import('../src/task-manager.js').ManagerOptions) {
        return new TaskManager({ ...options, transport: () => fake, environment: {}, pollMs: 1,
          egressClient: () => ({ async createPolicy(actor) { return { actor, name: 'default', uid: 'fixture-uid', version: '1', cidrs: egress.cidrs }; }, async getPolicy() { throw new Error('No implicit get'); }, close() {} }),
        });
      },
    };
    await assert.rejects(mode === 'wire' ? runWire(configured, output, ownership, deps) : runSqlite(configured, output, ownership, deps), /unresolved/);
    assert.equal(fake.calls.includes('delete'), false); assert.equal(confirmed, false);
    assert.equal(JSON.parse(await readFile(path.join(output, 'archive.json'), 'utf8')).complete, true);
    const owner = JSON.parse(await readFile(path.join(ownership, 'owner.json'), 'utf8'));
    assert.equal(owner.identity.nativeScope.address, egress.address);
    assert.notEqual(owner.stage, 'cleaned');
    await assert.rejects(runWire(configured, path.join(root, `${mode}-fresh`), ownership, deps), /unresolved/);
  }
});
