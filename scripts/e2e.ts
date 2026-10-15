import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { EgressPolicyClient, nativeEvidenceScope, requireNativeEvidenceScope } from '../src/ax/egress-client.js';
import { runOwnedE2E, reconcileOwnedE2E, type EvidenceSave } from './e2e-lifecycle.js';
import { captureRuntime, confirmRuntimeAbsent, type RuntimeEvidence } from './e2e-native-evidence.js';
import { AxTransport } from '../src/ax/client.js';
import { loadConfig, readCredentialEnv, type AxConfig } from '../src/config.js';
import { TaskManager, type ManagerOptions } from '../src/task-manager.js';
import { TaskStore } from '../src/task-store.js';
import { createSnapshot, sha256 } from '../src/workspace.js';
import { verifyGuestSupervision } from './guest-supervision.js';

const repository = fileURLToPath(new URL('../', import.meta.url));
const ownershipRoot = path.join(repository, '.cache/e2e-ownership');

async function sourceEvidence(save: EvidenceSave) {
  const files = ['scripts/e2e.ts', 'scripts/e2e-lifecycle.ts', 'scripts/e2e-native-evidence.ts', 'scripts/guest-supervision.ts',
    'src/task-manager.ts', 'src/ax/egress-client.ts', 'worker/run.ts', 'worker/supervise.c', 'proto/PROVENANCE.md'];
  const hashes = [];
  for (const name of files) hashes.push({ name, sha256: sha256(await readFile(path.join(repository, name))) });
  await save('source-evidence.json', { hashes, note: 'Host source provenance, not proof of deployed image contents; image digest and guest runtime are separate evidence.' });
}

interface WireDependencies {
  transport: AxTransport;
  bindPolicy(ref: { atespace: string; name: string }): Promise<void>;
  capture: typeof captureRuntime;
  confirm: typeof confirmRuntimeAbsent;
  supervision: typeof verifyGuestSupervision;
}
export async function runWire(config: AxConfig, output: string, root = ownershipRoot, injected?: WireDependencies) {
  const transport = injected?.transport ?? new AxTransport(config);
  const capture = injected?.capture ?? captureRuntime;
  const confirm = injected?.confirm ?? confirmRuntimeAbsent;
  const supervision = injected?.supervision ?? verifyGuestSupervision;
  const ref = { atespace: config.atespace, name: `pi-ax-probe-${randomUUID()}` };
  let native: RuntimeEvidence | undefined;
  let terminal = false;
  const files = ['source-evidence.json', 'check-status.json', 'task.json', 'roundtrip.bin', 'process.json', 'stdout.log', 'stderr.log', 'ax-evidence.json', 'native-evidence.json'];
  try {
    assert(config.egress, 'E2E requires explicit native egress configuration');
    const nativeScope = nativeEvidenceScope(config.egress);
    await runOwnedE2E({ root, output, mode: 'wire', identity: { nativeScope, ref, controlAddress: config.controlAddress, routerAddress: config.routerAddress, image: config.workerImage },
    async execute(save) {
      await save('check-status.json', { check: 'wire_preparation', state: 'checking' });
      await sourceEvidence(save);
      requireNativeEvidenceScope(config.egress!, nativeScope);
      const task = await transport.createTask(ref, config.workerImage);
      await save('task.json', { ref, image: task.spec?.image, actor: task.status?.actor, phase: task.status?.phase });
      if (injected) await injected.bindPolicy(ref);
      else {
        assert(config.egress, 'Wire E2E requires native policy configuration');
        const policy = new EgressPolicyClient(config.egress);
        try { await policy.createPolicy(ref); } finally { policy.close(); }
      }
      await save('activation-intent.json', { ref });
      await transport.resumeTask(ref);
      const deadline = Date.now() + 120_000;
      while (!(await transport.ready(ref))) { assert(Date.now() < deadline, 'Guest readiness deadline exceeded'); await delay(1000); }
      const bytes = Buffer.from('pi-ax real AX binary file roundtrip\0\xff', 'latin1');
      await transport.writeFile(ref, '/workspace/pi-ax-probe.bin', bytes);
      const fileChunks: Buffer[] = [];
      for await (const chunk of transport.readFile(ref, '/workspace/pi-ax-probe.bin')) fileChunks.push(chunk);
      const received = Buffer.concat(fileChunks);
      assert.deepEqual(received, bytes);
      await writeFile(path.join(output, 'roundtrip.bin'), received, { mode: 0o600 });
      const code = `const fs=require('node:fs');const cp=require('node:child_process');const crypto=require('node:crypto');console.log(JSON.stringify({node:process.version,pi:JSON.parse(fs.readFileSync('/opt/pi/node_modules/@earendil-works/pi-coding-agent/package.json')).version,builtPi:fs.readFileSync('/opt/pi/pi-version','utf8').trim(),sqlite:cp.execFileSync('sqlite3',['--version'],{encoding:'utf8'}).trim(),kernel:cp.execFileSync('uname',['-a'],{encoding:'utf8'}).trim(),sha256:crypto.createHash('sha256').update(fs.readFileSync('/workspace/pi-ax-probe.bin')).digest('hex')}));`;
      await save('process-intent.json', { ref, startAttempted: true });
      let processState = await transport.startProcess(ref, { command: ['node', '-e', code], cwd: '/workspace', env: {}, timeoutSeconds: 900 });
      await save('process.json', processState);
      const processDeadline = Date.now() + 30_000;
      while (processState.state !== 'PROCESS_STATE_EXITED') {
        assert(Date.now() < processDeadline, 'Probe process remains unconfirmed; preserved for manual cleanup');
        await delay(500); processState = await transport.getProcess(ref, processState.processId);
      }
      await save('process.json', processState);
      const chunks: Buffer[] = [];
      const stderr: Buffer[] = [];
      for await (const item of transport.streamProcessOutput(ref, processState.processId)) {
        if (item.stdout) chunks.push(item.stdout);
        if (item.stderr) stderr.push(item.stderr);
      }
      await writeFile(path.join(output, 'stdout.log'), Buffer.concat(chunks), { mode: 0o600 });
      await writeFile(path.join(output, 'stderr.log'), Buffer.concat(stderr), { mode: 0o600 });
      terminal = true;
      await save('check-status.json', { check: 'wire_process_exit_and_output', state: 'checking' });
      assert.equal(processState.exitCode, 0);
      assert.equal(Buffer.concat(stderr).length, 0, 'Probe stderr exported');
      await save('check-status.json', { check: 'wire_runtime_version_and_file_hash', state: 'checking' });
      const runtime = JSON.parse(Buffer.concat(chunks).toString()) as { sha256: string; pi: string; builtPi: string };
      assert.equal(runtime.sha256, sha256(bytes)); assert.match(runtime.pi, /^\d+\.\d+\.\d+/);
      assert.equal(runtime.pi, runtime.builtPi, 'Guest Pi differs from the image build version');
      await save('runtime.json', runtime);
      files.push('runtime.json');
      terminal = false; // An uncertain supervision start must keep ownership, even if the first process exited.
      await save('check-status.json', { check: 'wire_owned_descendant_termination', state: 'checking' });
      await supervision(transport, ref, output);
      files.push('supervision-intent.json', 'supervision-process.json', 'supervision-termination.json', 'supervision-passed.json');
      terminal = true;
      await save('check-status.json', { check: 'wire_acceptance', state: 'passed' });
      await save('passed.json', { mode: 'wire', ref, processId: processState.processId, fileSha256: sha256(bytes), modelExecuted: false });
      files.push('passed.json');
    },
    async archive(save) {
      native = await capture(config, transport, ref, save, nativeScope);
      return { terminal, files };
    },
    async destroy() { requireNativeEvidenceScope(config.egress!, nativeScope); await transport.deleteTask(ref); },
    async confirm(save) { assert(native); await confirm(config, transport, native, save, nativeScope); },
  }); } finally { transport.close(); }
}

interface SqliteDependencies {
  transport: AxTransport;
  manager(options: ManagerOptions): TaskManager;
  capture: typeof captureRuntime;
  confirm: typeof confirmRuntimeAbsent;
}
export async function runSqlite(config: AxConfig, output: string, root = ownershipRoot, injected?: SqliteDependencies) {
  const store = new TaskStore(path.join(output, 'state'));
  const transport = injected?.transport ?? new AxTransport(config);
  const createManager = injected?.manager ?? ((options: ManagerOptions) => new TaskManager(options));
  const capture = injected?.capture ?? captureRuntime;
  const confirm = injected?.confirm ?? confirmRuntimeAbsent;
  let manager = createManager({ store, config: () => config });
  let native: RuntimeEvidence | undefined;
  let taskId: string | undefined;
  let acceptancePassed = false;
  const cwd = path.join(output, 'input');
  let original: Awaited<ReturnType<typeof createSnapshot>>;
  try {
    assert(config.egress, 'E2E requires explicit native egress configuration');
    const nativeScope = nativeEvidenceScope(config.egress);
    await runOwnedE2E({ root, output, mode: 'sqlite', identity: { nativeScope, stateDir: store.root, controlAddress: config.controlAddress, routerAddress: config.routerAddress, image: config.workerImage },
    async execute(save) {
      await save('check-status.json', { check: 'sqlite_preparation', state: 'checking' });
      await sourceEvidence(save);
      await mkdir(cwd, { mode: 0o700 });
      await writeFile(path.join(cwd, 'keep.txt'), 'uncommitted input\n');
      await writeFile(path.join(cwd, 'delete-me.txt'), 'delete this file\n');
      await writeFile(path.join(cwd, '.env'), 'PI_AX_EXCLUDED_SENTINEL=not-a-secret\n');
      original = await createSnapshot(cwd);
      await save('input-evidence.json', { sha256: original.sha256 });
      await save('check-status.json', { check: 'sqlite_launch_and_termination', state: 'checking' });
      requireNativeEvidenceScope(config.egress!, nativeScope);
      const view = await manager.spawn('Create crud.py using only Python standard-library sqlite3, or crud.mjs using node:sqlite. The program must create a SQLite database, create a table, INSERT one row, SELECT/assert its value, UPDATE/assert the changed value, DELETE/assert zero rows, and print PI_AX_SQLITE_CRUD_OK only after all assertions pass. Execute the program now and include the actual command/output in your final answer. Keep the runnable source and database in this workspace. Modify keep.txt and delete delete-me.txt. Do not commit/push. Do not write wrapper artifacts.', cwd);
      taskId = view.taskId;
      await save('task-id.json', { taskId });
      const deadline = Date.now() + 1020_000;
      let current = view;
      while (current.processState !== 'exited') {
        assert(Date.now() < deadline, 'E2E deadline: no implicit cancellation/deletion; retain task ID');
        await delay(2000); [current] = await manager.status(view.taskId);
        await save('status.json', current);
        if (current.processState !== 'exited') assert(current.state !== 'unknown' && current.state !== 'failed', 'Remote execution uncertain; inspect exported status');
      }
      // Recreate the manager before retrieval: persisted host records, not conversation state.
      await manager.close(); manager = createManager({ store: new TaskStore(store.root), config: () => { throw new Error('Restart must use persisted configuration'); } });
      current = await manager.result(view.taskId);
      await save('result-view.json', current);
      await save('check-status.json', { check: 'sqlite_worker_outcome_and_archive', state: 'checking' });
      assert.equal(current.state, 'completed'); assert.equal(current.archiveComplete, true);
      assert(current.archiveDirectory && current.patchPath);
      await save('check-status.json', { check: 'sqlite_successful_bash_crud_marker', state: 'checking' });
      const events = await readFile(path.join(current.archiveDirectory, 'events.jsonl'), 'utf8');
      const completedTools = events.split('\n').filter(Boolean).map((line) => JSON.parse(line) as { type?: string; toolName?: string; isError?: boolean; result?: unknown });
      assert(completedTools.some((event) => event.type === 'tool_execution_end' && event.toolName === 'bash' && !event.isError && JSON.stringify(event.result).includes('PI_AX_SQLITE_CRUD_OK')), 'No successful guest bash result with SQLite assertion marker');
      await save('check-status.json', { check: 'sqlite_source_and_deletion_patch', state: 'checking' });
      const patch = await readFile(current.patchPath, 'utf8');
      assert.match(patch, /crud\.(py|mjs)/); assert.match(patch, /deleted file mode/);
      await save('check-status.json', { check: 'sqlite_host_source_nonmutation', state: 'checking' });
      assert.equal((await createSnapshot(cwd)).sha256, original.sha256, 'Host input mutated');
      await save('check-status.json', { check: 'sqlite_acceptance', state: 'passed' });
      await save('passed.json', { mode: 'sqlite', taskId: view.taskId, archiveDirectory: current.archiveDirectory, modelExecuted: true, note: 'Automated marker checks supplement, not replace, review of exported source/tool logs and actual Actor/template runtime evidence.' });
      acceptancePassed = true;
    },
    async archive(save) {
      // Even spawn/early assertion failure exports safe persisted status before any throw.
      const records = await store.list();
      assert.equal(records.length, 1, 'Dedicated store must identify exactly one owned task');
      taskId = records[0].view.taskId;
      await save('task-id.json', { taskId });
      await save('status.json', records[0].view);
      const current = await manager.result(taskId);
      await save('result-view.json', current);
      native = await capture(config, transport, { atespace: config.atespace, name: taskId }, save, nativeScope);
      const observedSha256 = (await createSnapshot(cwd)).sha256;
      await save('source-nonmutation.json', { originalSha256: original?.sha256, observedSha256, unchanged: original?.sha256 === observedSha256 });
      if (!current.archiveComplete || current.terminationConfirmed !== true || current.processState !== 'exited' || !current.archiveDirectory) return { terminal: false, files: [] };
      const manifest = JSON.parse(await readFile(path.join(current.archiveDirectory, 'archive.json'), 'utf8')) as { files: { name: string }[] };
      return { terminal: true, files: ['source-evidence.json', 'check-status.json', ...(acceptancePassed ? ['passed.json'] : []), 'input-evidence.json', 'source-nonmutation.json', 'task-id.json', 'status.json', 'result-view.json', 'ax-evidence.json', 'native-evidence.json',
        ...['snapshot.json', 'request.json'].map((name) => path.join('state', taskId!, name)),
        ...['archive.json', ...manifest.files.map((f) => f.name)].map((name) => path.join('state', taskId!, 'results', name))] };
    },
    async destroy(save) {
      assert(taskId);
      requireNativeEvidenceScope(config.egress!, nativeScope);
      const view = await manager.destroy(taskId);
      await save('destroy-view.json', view);
      assert.equal(view.state, 'destroyed', 'Deletion uncertain; do not retry');
    },
    async confirm(save) { assert(native); await confirm(config, transport, native, save, nativeScope); },
  }); } finally { await manager.close(); transport.close(); }
}

/** Same checked recovery path used by the CLI; transport injection is for local harness tests. */
export async function reconcileE2E(config: AxConfig, root = ownershipRoot, transport = new AxTransport(config)): Promise<void> {
  try {
    await reconcileOwnedE2E(root, async (owner, save) => {
      assert.equal(owner.identity.controlAddress, config.controlAddress);
      assert.equal(owner.identity.routerAddress, config.routerAddress);
      const evidence = JSON.parse(await readFile(path.join(owner.output, 'native-evidence.json'), 'utf8')) as RuntimeEvidence;
      assert.equal(evidence.actor.ref.atespace, config.atespace);
      if ('ref' in owner.identity) assert.deepEqual(evidence.actor.ref, owner.identity.ref);
      else {
        assert.equal(owner.identity.stateDir, path.join(owner.output, 'state'));
        const records = await new TaskStore(owner.identity.stateDir as string).list();
        assert.equal(records.length, 1); assert.equal(evidence.actor.ref.name, records[0].view.taskId);
      }
      await confirmRuntimeAbsent(config, transport, evidence, save, owner.identity.nativeScope);
    });
  } finally { transport.close(); }
}

async function main() {
  const mode = process.argv[2];
  const output = process.argv[3];
  if (mode === 'reconcile' && !output) {
    const config = loadConfig();
    await reconcileE2E(config);
    console.log('Owned E2E archive reverified and resource absence confirmed; no mutation replayed.');
    return;
  }
  if (!['wire', 'sqlite'].includes(mode) || !output || !path.isAbsolute(output)) throw new Error('Usage: npm run e2e:wire|e2e:sqlite -- /absolute/fresh/evidence-directory');
  const config = loadConfig();
  assert(config.egress, 'E2E requires explicit native egress configuration');
  if (mode === 'sqlite') {
    assert(config.credentialEnv.length > 0, 'SQLite model E2E requires explicit credentialEnv');
    readCredentialEnv(config);
    await runSqlite(config, output);
  } else await runWire(config, output);
  console.log(`E2E checks passed; owned remote cleanup confirmed. Independently review local evidence: ${output}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('E2E stopped. Inspect diagnostic/status/cleanup evidence and .cache/e2e-ownership/owner.json; no automatic retry.'); process.exitCode = 1; });
}
