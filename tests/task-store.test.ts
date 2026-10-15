import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TaskBusyError, TaskStore, acquireLock } from '../src/task-store.js';

const fixture = new URL('./fixtures/task-store-process.ts', import.meta.url).pathname;
function child(args: string[]) {
  return spawn(process.execPath, ['--import', 'tsx', fixture, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
}

test('Linux flock arbitrates real processes and releases after abrupt owner death, without stale-lease stealing', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-lock-')); t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'test.lock');
  const held = child(['lock', file]); t.after(() => held.kill('SIGKILL'));
  await once(held.stdout, 'data');
  await assert.rejects(acquireLock(file), TaskBusyError);
  const exited = once(held, 'exit'); held.kill('SIGKILL'); await exited;
  // Closing the inherited stdin pipe lets the flock child release the kernel lock.
  let release: (() => Promise<void>) | undefined;
  for (let i = 0; i < 50; i++) {
    try { release = await acquireLock(file); break; }
    catch (error) { if (!(error instanceof TaskBusyError)) throw error; await new Promise((r) => setTimeout(r, 10)); }
  }
  assert(release); await release();
});

test('competing host processes reserve at most one active task in a shared state directory', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-reserve-')); t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'input'); await mkdir(cwd); await writeFile(path.join(cwd, 'a.txt'), 'a');
  const state = path.join(root, 'state');
  const outputs = await Promise.all([1, 2].map(async () => {
    const p = child(['reserve', state, cwd]); let stdout = ''; let stderr = '';
    p.stdout.on('data', (b: Buffer) => { stdout += b.toString(); }); p.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
    const [code] = await once(p, 'exit'); assert.equal(code, 0, stderr); return stdout;
  }));
  assert.equal(outputs.filter((s) => s.startsWith('accepted')).length, 1);
  assert.equal(outputs.filter((s) => s.startsWith('rejected')).length, 1);
  const records = await new TaskStore(state).list(); assert.equal(records.length, 1); assert.equal(records[0].view.active, true);
});

test('state store rejects shared permissions and symlink roots instead of trusting them', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-perms-')); t.after(() => rm(root, { recursive: true, force: true }));
  const shared = path.join(root, 'shared'); await mkdir(shared); await chmod(shared, 0o755);
  await assert.rejects(new TaskStore(shared).initialize(), /private directory/);
  const link = path.join(root, 'link'); await symlink(shared, link);
  await assert.rejects(new TaskStore(link).initialize(), /private directory/);
  assert.throws(() => new TaskStore('relative'), /absolute/);
});

test('v1 records roundtrip optional strict egress paths without reading or persisting credentials', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-record-egress-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new TaskStore(path.join(root, 'state')); await store.initialize();
  const id = 'ax-00000000-0000-0000-0000-000000000000';
  const record: import('../src/task-schema.js').TaskRecord = {
    version: 1, config: { controlAddress: 'localhost:1', routerAddress: 'localhost:2', atespace: 'unit', workerImage: 'unit', workerProvider: 'unit', workerModel: 'unit', credentialEnv: [] },
    snapshotSha256: 'a'.repeat(64), remoteAttempted: true, startAttempted: false, resultOutcome: null, patchComplete: false,
    view: { taskId: id, state: 'unknown', stage: 'egress_policy_requested', active: true, createdAt: '2026-01-01', updatedAt: '2026-01-01', remote: `unit/${id}`, processId: null, processState: 'unknown', exitCode: null, deadlineAt: null, deadlineExceeded: false, cancellationRequested: false, cancellationConfirmed: false, archiveDirectory: null, archiveComplete: false, patchPath: null, note: 'fixture' },
  };
  await mkdir(store.directory(id), { mode: 0o700 });
  await store.write(record); assert.equal((await store.read(id)).config.egress, undefined);
  const egress = { address: 'localhost:1236', serverName: 'api.ate-system.svc', caFile: path.join(root, 'absent-ca'), bearerTokenFile: path.join(root, 'absent-token'), cidrs: ['192.0.2.97/32'] };
  record.config.egress = egress;
  await store.write(record); assert.deepEqual((await store.read(id)).config.egress, egress);
  for (const invalid of [{ ...egress, token: 'synthetic-secret-never-persist' }, { ...egress, cidrs: ['0.0.0.0/0'] }, { ...egress, caFile: 'relative' }]) {
    record.config.egress = invalid;
    await assert.rejects(store.write(record), /Invalid task state/);
  }
  const { readFile } = await import('node:fs/promises');
  const disk = await readFile(path.join(store.directory(id), 'task.json'), 'utf8');
  assert(!disk.includes('synthetic-secret-never-persist'));
  assert.deepEqual((await store.read(id)).config.egress, egress);
  const file = path.join(store.directory(id), 'task.json');
  const malformed = JSON.parse(disk); malformed.config.egress.cidrs = ['0.0.0.0/0'];
  await writeFile(file, JSON.stringify(malformed));
  await assert.rejects(store.read(id), /Invalid persisted task record/);
});
