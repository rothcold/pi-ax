import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { runWorker } from '../worker/run.js';
import { createSnapshot, sha256 } from '../src/workspace.js';
import { MAX_LOG_BYTES, parseWorkerRequest, parseWorkerResult, parseWorkerTermination, workerPaths } from '../src/worker-protocol.js';
import type { WorkerRequest } from '../src/worker-protocol.js';

const fixture = fileURLToPath(new URL('./fixtures/pi-process.mjs', import.meta.url));
const token = 'fixture-"secret\\value\nsecondline';
async function setup(t: test.TestContext, prompt: string) {
  const root = await mkdtemp(path.join(tmpdir(), 'pi-ax-wrapper-test-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const input = path.join(root, 'input'); await mkdir(input);
  await writeFile(path.join(input, 'delete.txt'), 'delete me');
  await writeFile(path.join(input, 'source.txt'), 'working tree');
  await writeFile(path.join(input, '.env'), 'HOST-NOT-UPLOADED');
  const snapshot = await createSnapshot(input);
  const request: WorkerRequest = { version: 1, taskId: 'fixture-task', prompt, provider: 'fixture-provider', model: 'fixture-model', credentialEnv: ['FIXTURE_TOKEN'], snapshotSha256: snapshot.sha256 };
  const paths = workerPaths(root);
  await writeFile(paths.request, JSON.stringify(request)); await writeFile(paths.snapshot, snapshot.payload);
  const options = { root, supervisorExecutable: fileURLToPath(new URL('../dist/worker/supervise', import.meta.url)), executable: process.execPath, executableArgs: [fixture], environment: { FIXTURE_TOKEN: token, HOST_SENTINEL: 'never pass', NODE_OPTIONS: 'never pass', AX_TASK_YAML: 'never pass' } };
  return { root, request, paths, options };
}

test('worker runs controlled subprocess once, verifies JSON completion, exports hashed binary patch and redacted logs', async (t) => {
  const { paths, options } = await setup(t, 'success');
  const result = await runWorker(options);
  assert.equal(result.outcome, 'completed'); assert.equal(result.piExitCode, 0);
  assert.equal(result.agentSettled, true); assert.equal(result.patchComplete, true);
  assert.match(result.finalText, /fixture complete\u2028still one line/);
  assert.match(result.finalText, /\[REDACTED\]/);
  assert.equal(result.finalText.includes(token), false);
  assert.deepEqual(parseWorkerResult(await readFile(paths.result)), result);
  for (const artifact of result.artifacts) {
    const bytes = await readFile(path.join(paths.artifacts, artifact.name));
    assert.equal(bytes.length, artifact.bytes); assert.equal(sha256(bytes), artifact.sha256);
    if (artifact.name !== 'changes.patch') {
      assert.equal(bytes.includes(token), false);
      assert.equal(bytes.includes(JSON.stringify(token).slice(1, -1)), false);
    }
  }
  const events = (await readFile(paths.events, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(events.at(-1).type, 'agent_settled');
  assert.equal(events.find((event) => event.type === 'tool_execution_start').args.command, 'fixture-command (not executed)');
  assert.equal(events.find((event) => event.type === 'tool_execution_end').isError, true);
  assert.match(await readFile(paths.stderr, 'utf8'), /\[REDACTED\]/);
  assert.match(await readFile(paths.patch, 'utf8'), /GIT binary patch/);
  assert.match(await readFile(paths.patch, 'utf8'), /deleted file mode/);
  await assert.rejects(runWorker(options), /EEXIST/);
});

for (const [prompt, outcome] of [['error-event', 'failed'], ['nonzero', 'failed'], ['no-events', 'incomplete'], ['invalid', 'incomplete'], ['retry', 'incomplete'], ['length', 'incomplete'], ['long-record', 'incomplete'], ['unterminated', 'incomplete']] as const) {
  test(`worker ${prompt}: exit status alone never invents successful completion`, async (t) => {
    const { options, paths } = await setup(t, prompt);
    const result = await runWorker(options);
    assert.equal(result.outcome, outcome);
    assert.equal(result.patchComplete, true);
    assert.deepEqual(parseWorkerResult(await readFile(paths.result)), result);
    if (prompt === 'error-event') assert.equal(result.piExitCode, 0);
    if (prompt === 'nonzero') assert.equal(result.piExitCode, 7);
    if (prompt === 'long-record') assert.equal(result.logsTruncated, true);
  });
}

test('worker bounded logs keep consuming and decoding completion after log cap', async (t) => {
  const { options, paths } = await setup(t, 'large-log');
  const result = await runWorker(options);
  assert.equal(result.outcome, 'completed'); assert.equal(result.logsTruncated, true);
  assert.ok((await readFile(paths.events)).length <= MAX_LOG_BYTES);
});

test('worker stderr redaction remains bounded for overlapping secrets and a large unterminated line', async (t) => {
  const { options, paths } = await setup(t, 'large-stderr');
  options.environment.FIXTURE_TOKEN = 'aa';
  const result = await runWorker(options);
  assert.equal(result.outcome, 'completed'); assert.equal(result.logsTruncated, true);
  const stderr = await readFile(paths.stderr, 'utf8');
  assert.ok(Buffer.byteLength(stderr) <= MAX_LOG_BYTES);
  assert.equal(stderr.includes('aa'), false);
});

test('worker missing credential preserves incomplete result and unchanged baseline patch', async (t) => {
  const { options, paths } = await setup(t, 'success'); options.environment.FIXTURE_TOKEN = '';
  const result = await runWorker(options);
  assert.equal(result.outcome, 'incomplete'); assert.equal(result.piExitCode, null);
  assert.equal(result.patchComplete, true); assert.equal((await readFile(paths.patch)).length, 0);
});

test('worker request/result schemas reject reserved env, invalid hashes and contradictory completion', async (t) => {
  const { request, options } = await setup(t, 'success');
  for (const update of [{ credentialEnv: ['NODE_OPTIONS'] }, { credentialEnv: ['HOME'] }, { credentialEnv: ['FOO', 'FOO'] }, { credentialEnv: ['a,b'] }, { snapshotSha256: 'bad' }, { model: '--api-key' }]) {
    assert.throws(() => parseWorkerRequest(Buffer.from(JSON.stringify({ ...request, ...update }))));
  }
  const result = await runWorker(options);
  for (const update of [{ agentSettled: false }, { piExitCode: 1 }, { patchComplete: false }, { artifacts: [...result.artifacts, result.artifacts[0]] }]) {
    assert.throws(() => parseWorkerResult(Buffer.from(JSON.stringify({ ...result, ...update }))));
  }
});

for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
  test(`worker actual wrapper subprocess ${signal}: persist partial result or leave absent manifest, never fabricate success`, { timeout: 15_000 }, async (t) => {
    const { root, paths } = await setup(t, 'slow');
    const driver = fileURLToPath(new URL('./fixtures/worker-driver.ts', import.meta.url));
    const child = spawn(process.execPath, ['--import', 'tsx', driver, root, fixture], { detached: true, stdio: 'ignore' });
    const closed = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    t.after(() => { try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ } });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { await access(path.join(paths.repository, 'fixture-started')); ready = true; break; } catch { await delay(50); }
    }
    assert.equal(ready, true);
    assert.ok(child.pid);
    process.kill(-child.pid, signal);
    await closed;
    await access(paths.started);
    await waitForFile(paths.termination);
    assert.equal(parseWorkerTermination(await readFile(paths.termination)).taskId, 'fixture-task');
    if (signal === 'SIGKILL') await assert.rejects(access(paths.result), /ENOENT/);
    else { const result = parseWorkerResult(await readFile(paths.result)); assert.notEqual(result.outcome, 'completed'); assert.equal(result.patchComplete, true); }
  });
}

async function waitForFile(file: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    try { if ((await readFile(file)).length) return; } catch { /* Waiting for child evidence. */ }
    await delay(25);
  }
  throw new Error(`Timed out waiting for test evidence ${file}`);
}
for (const mode of ['SIGTERM', 'SIGKILL', 'deadline', 'normal-detached'] as const) {
  test(`worker subreaper reaps actual root-tooling Pi detached bash and descendants: ${mode}`, { timeout: 15_000 }, async (t) => {
    const pi = JSON.parse(await readFile(new URL('../node_modules/@earendil-works/pi-coding-agent/package.json', import.meta.url), 'utf8'));
    t.diagnostic(`Actual bash runtime: root node_modules/@earendil-works/pi-coding-agent ${pi.version}; not the floating image runtime`);
    const { root, paths } = await setup(t, mode);
    const driver = fileURLToPath(new URL('./fixtures/worker-driver.ts', import.meta.url));
    const realBash = fileURLToPath(new URL('./fixtures/pi-bash.mjs', import.meta.url));
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    t.after(() => { unrelated.kill('SIGKILL'); });
    const child = spawn(process.execPath, ['--import', 'tsx', driver, root, realBash, mode === 'deadline' ? '1500' : '890000'], { detached: true, stdio: 'ignore' });
    const closed = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', () => resolve()); });
    t.after(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* Already exited. */ } });
    const pidFiles = ['bash.pid', 'detached.pid'].map((name) => path.join(paths.repository, name));
    for (const file of pidFiles) await waitForFile(file);
    const pids = await Promise.all(pidFiles.map(async (file) => Number((await readFile(file, 'utf8')).trim())));
    if (mode === 'SIGTERM' || mode === 'SIGKILL') process.kill(-child.pid!, mode);
    await closed;
    await waitForFile(paths.termination);
    const proof = parseWorkerTermination(await readFile(paths.termination));
    assert.equal(proof.taskId, 'fixture-task');
    for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.doesNotThrow(() => process.kill(unrelated.pid!, 0)); // No container-wide kills.
    if (mode === 'SIGKILL') await assert.rejects(access(paths.result), /ENOENT/);
    else {
      const result = parseWorkerResult(await readFile(paths.result));
      assert.equal(result.outcome === 'completed', mode === 'normal-detached');
      assert.equal(proof.interrupted, mode !== 'normal-detached');
    }
  });
}

test('supervisor parent-registration race does not launch Pi after wrapper death', async (t) => {
  const { paths } = await setup(t, 'success');
  await mkdir(paths.artifacts);
  const helper = fileURLToPath(new URL('../dist/worker/supervise', import.meta.url));
  const child = spawn(helper, ['2147483647', paths.termination, 'fixture-task', 'a'.repeat(64), '1000', process.execPath, '-e', 'process.stdout.write("MUST_NOT_RUN")']);
  let output = ''; child.stdout.on('data', (chunk) => { output += chunk; });
  await new Promise<void>((resolve) => child.once('close', () => resolve()));
  assert.equal(output, '');
  const proof = parseWorkerTermination(await readFile(paths.termination));
  assert.equal(proof.interrupted, true); assert.equal(proof.piExitCode, null);
});

test('unavailable native supervisor is explicit failure with no termination proof, not fallback execution', async (t) => {
  const { options, paths } = await setup(t, 'success');
  options.supervisorExecutable = path.join(paths.artifacts, 'missing-supervisor');
  const result = await runWorker(options);
  assert.notEqual(result.outcome, 'completed'); assert.equal(result.piExitCode, null);
  assert(result.issues.includes('Worker supervision unavailable'));
  assert(result.issues.includes('Owned-descendant termination unconfirmed'));
  await assert.rejects(access(paths.termination), /ENOENT/);
});
