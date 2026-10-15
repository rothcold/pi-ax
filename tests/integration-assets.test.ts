import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Regression: Docker may list an unqualified alias first, despite a successful local push.
test('image-ref selects the pushed local registry digest, not RepoDigests[0]', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  const repository = 'localhost:32768/pi-ax-worker';
  const run = (digests: string[]) => spawnSync(process.execPath, ['scripts/image-ref.mjs', repository], { input: JSON.stringify(digests), encoding: 'utf8' });
  const result = run([`pi-ax-worker@${digest}`, `${repository}@${digest}`]);
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), `${repository}@${digest}`);
  assert.notEqual(run([`pi-ax-worker@${digest}`]).status, 0);
  assert.notEqual(run([`${repository}@sha256:bad`]).status, 0);
});

test('npm tarball contains runtime/build assets and loads five tools through the actual Pi loader', () => {
  const result = spawnSync(process.execPath, ['scripts/check-package.mjs'], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Actual Pi loader: five tools/);
});

test('local AX setup refuses an existing registry before any creation (stub Docker, no deployment)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-setup-guard-'));
  try {
    await mkdir(path.join(root, 'scripts')); await mkdir(path.join(root, 'bin'));
    await writeFile(path.join(root, 'scripts/local-ax.sh'), await readFile('scripts/local-ax.sh'));
    await writeFile(path.join(root, 'bin/docker'), '#!/bin/sh\nif [ "$1 $2" = "container inspect" ]; then exit 0; fi\necho "UNEXPECTED DOCKER MUTATION" >&2\nexit 42\n', { mode: 0o755 });
    const result = spawnSync('bash', [path.join(root, 'scripts/local-ax.sh'), 'create'], { encoding: 'utf8', env: { PATH: `${root}/bin:/usr/bin:/bin` } });
    assert.equal(result.status, 1); assert.match(result.stderr, /Registry name collision/);
    assert.doesNotMatch(result.stderr, /UNEXPECTED DOCKER/);
    await assert.rejects(readFile(path.join(root, '.cache/pi-ax/environment')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local AX setup uses pinned worker version and syntax-valid guarded deployment', async () => {
  const result = spawnSync('bash', ['-n', 'scripts/local-ax.sh'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const script = await readFile('scripts/local-ax.sh', 'utf8');
  // Worker binaries must use the same version as the official installer's node/pool labels.
  assert.match(script, /ko build \.\/cmd\/ateom-gvisor .*--ldflags="-X=github.com\/agent-substrate\/substrate\/internal\/version.Version=\$SUB_REV"/);
  assert.doesNotMatch(script, /--bare/);
  assert.match(script, /PI_AX_CONFIRM_DELETE/);
  assert.doesNotMatch(script, /hack\/(create|delete)-kind-cluster.sh/);
  const pool = await readFile('scripts/local-workerpool.yaml', 'utf8');
  assert.match(pool, /replicas: 2/); // Capacity for the new template's golden and actual actor.
  assert.match(pool, /limits:\s+cpu: "4"\s+memory: 8Gi/);
  assert.match(pool, /requests:\s+cpu: 250m\s+memory: 4Gi/);
});

test('egress bootstrap uses explicit local context, narrow CIDRs, private token and loopback ownership; failures stop', async (t) => {
  const { symlink, stat } = await import('node:fs/promises');
  const { egressFixture } = await import('./fixtures/egress-config.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-bootstrap-'));
  const owned: number[] = [];
  t.after(async () => { for (const pid of owned) { try { process.kill(pid, 'SIGTERM'); } catch { /* already exited */ } } await rm(root, { recursive: true, force: true }); });
  await mkdir(path.join(root, 'scripts')); await mkdir(path.join(root, '.cache/pi-ax/tools'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await symlink(path.resolve('src'), path.join(root, 'src'));
  await writeFile(path.join(root, 'scripts/bootstrap-egress.ts'), await readFile('scripts/bootstrap-egress.ts'));
  const fixture = egressFixture(root);
  const ca = await readFile(fixture.caFile, 'utf8');
  const calls = path.join(root, 'calls.jsonl');
  const kubectl = path.join(root, '.cache/pi-ax/tools/kubectl');
  await writeFile(kubectl, `#!${process.execPath}\nimport fs from 'node:fs'; const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args)+'\\n');
if(args.includes('serviceaccount')) console.log('serviceaccount/ate-client');
else if(args.includes('clustertrustbundles')) console.log(JSON.stringify({items:[{spec:{signerName:'servicedns.podcert.ate.dev/identity',trustBundle:${JSON.stringify(ca)}}}]}));
else if(args.includes('token')) console.log('synthetic-policy-sentinel');
else if(args.includes('port-forward')) { console.log('Forwarding from 127.0.0.1:12345 -> 443'); setInterval(()=>{},1000); }
else process.exit(42);\n`, { mode: 0o755 });
  const context = 'kind-pi-ax-20261005060812-529b13';
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', path.join(root, 'scripts/bootstrap-egress.ts'), context, ...args], { encoding: 'utf8', timeout: 20_000 });
  const invalid = run('0.0.0.0/0'); assert.equal(invalid.status, 1);
  await assert.rejects(readFile(calls));
  const result = run('192.0.2.97/32'); assert.equal(result.status, 0, result.stderr);
  assert(!result.stdout.includes('synthetic-policy-sentinel'));
  const evidence = /Private bootstrap: (.+)/.exec(result.stdout)![1];
  const owner = JSON.parse(await readFile(path.join(evidence, 'port-forward-owner.json'), 'utf8')); owned.push(owner.pid);
  assert.equal(owner.context, context); assert.equal(owner.address, '127.0.0.1');
  const fragment = JSON.parse(await readFile(path.join(evidence, 'egress-config.json'), 'utf8'));
  assert.equal(fragment.egress.address, '127.0.0.1:12345'); assert.equal(fragment.egress.serverName, 'api.ate-system.svc');
  assert.equal((await stat(fragment.egress.bearerTokenFile)).mode & 0o777, 0o600);
  assert.equal((await stat(evidence)).mode & 0o777, 0o700);
  const commands: string[][] = (await readFile(calls, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  for (const args of commands) assert.deepEqual(args.slice(0, 4), ['--kubeconfig', path.join(root, '.cache/pi-ax/kubeconfig'), '--context', context]);
  assert(commands.some((args) => args.includes('--audience=api.ate-system.svc') && args.includes('--duration=1h') && args.includes('ate-client')));
  assert(commands.some((args) => args.includes('--address') && args.includes('127.0.0.1') && args.includes(':443')));
  await writeFile(kubectl, '#!/bin/sh\nexit 42\n', { mode: 0o755 });
  const failed = run('192.0.2.97/32'); assert.equal(failed.status, 1); assert.match(failed.stderr, /no fallback/);
  await assert.rejects(readFile(path.join(root, 'ax-config.json')));
});

test('no-key egress probe refuses absent explicit consent before remote calls', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/verify-egress.ts'], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /no retry/);
});
