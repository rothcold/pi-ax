import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-image-script-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['bin', 'scripts', 'worker', 'home']) await mkdir(path.join(root, dir));
  await writeFile(path.join(root, 'scripts/build-image.mjs'), await readFile('scripts/build-image.mjs'));
  // Fake executables verify orchestration only. No registry, Docker image, AX or model is used.
  await writeFile(path.join(root, 'bin/npm'), `#!${process.execPath}
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
const args = process.argv.slice(2);
const cache = args[args.indexOf('--cache') + 1];
if (!existsSync(cache)) process.exit(98);
appendFileSync('calls.jsonl', JSON.stringify({ command: 'npm', args }) + '\\n');
process.stdout.write(readFileSync('lookup.json'));
process.exit(Number(process.env.FAKE_NPM_EXIT || 0));
`, { mode: 0o755 });
  await writeFile(path.join(root, 'bin/docker'), `#!${process.execPath}
import { appendFileSync } from 'node:fs';
appendFileSync('calls.jsonl', JSON.stringify({ command: 'docker', args: process.argv.slice(2) }) + '\\n');
process.exit(Number(process.env.FAKE_DOCKER_EXIT || 0));
`, { mode: 0o755 });
  const run = (env = {}) => spawnSync(process.execPath, [path.join(root, 'scripts/build-image.mjs')], {
    // Builder must select its own root, not the caller's cwd.
    cwd: os.tmpdir(), encoding: 'utf8', env: { PATH: path.join(root, 'bin'), HOME: path.join(root, 'home'), ...env },
  });
  const calls = async () => (await readFile(path.join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as { command: string; args: string[] });
  return { root, run, calls };
}

test('build-image resolves npm latest on every build and changes Docker cache input (fake npm/docker)', async (t) => {
  const { root, run, calls } = await fixture(t);
  for (const version of ['1.0.0', '1.0.1', '1.0.1']) {
    await writeFile(path.join(root, 'lookup.json'), JSON.stringify(version));
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`Worker Pi resolved from npm latest: ${version.replaceAll('.', '\\.')}`));
  }
  const entries = await calls();
  assert.deepEqual(entries.map((c) => c.command), ['npm', 'docker', 'npm', 'docker', 'npm', 'docker']);
  const caches = [];
  for (let i = 0; i < entries.length; i += 2) {
    const args = entries[i].args;
    assert.deepEqual(args.slice(0, -1), ['view', '@earendil-works/pi-coding-agent', 'dist-tags.latest', '--json', '--prefer-online', '--offline=false', '--cache']);
    caches.push(args.at(-1)!);
    await assert.rejects(access(args.at(-1)!), { code: 'ENOENT' });
    assert.deepEqual(entries[i + 1].args, ['build', '--progress=plain', '-f', 'worker/Dockerfile', '--build-arg', `PI_VERSION=${i === 0 ? '1.0.0' : '1.0.1'}`, '-t', 'pi-ax-worker:local', '.']);
  }
  assert.equal(new Set(caches).size, 3);
});

test('build-image lookup errors and invalid versions prevent Docker launch (fake npm/docker)', async (t) => {
  const { root, run, calls } = await fixture(t);
  for (const value of ['null', '[]', '{}', '"latest"', '"^1.0.0"', '"01.0.0"', '"1.0.0;echo bad"', JSON.stringify('1.0.0\n'), 'not-json']) {
    await writeFile(path.join(root, 'lookup.json'), value);
    assert.notEqual(run().status, 0, value);
  }
  await writeFile(path.join(root, 'lookup.json'), '"1.0.0"');
  assert.notEqual(run({ FAKE_NPM_EXIT: '1' }).status, 0);
  const entries = await calls();
  assert.equal(entries.length, 10);
  for (const entry of entries) {
    assert.equal(entry.command, 'npm');
    await assert.rejects(access(entry.args.at(-1)!), { code: 'ENOENT' });
  }
});

test('build-image propagates Docker failure without reporting success (fake npm/docker)', async (t) => {
  const { root, run } = await fixture(t);
  await writeFile(path.join(root, 'lookup.json'), '"1.0.0"');
  const result = run({ FAKE_DOCKER_EXIT: '1' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /Built pi-ax-worker/);
});

test('build-image refuses reintroduced worker locks before lookup (fake npm/docker)', async (t) => {
  const { root, run } = await fixture(t);
  for (const lock of ['npm-shrinkwrap.json', 'package-lock.json']) {
    const file = path.join(root, 'worker', lock);
    await writeFile(file, '{}');
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /worker Pi must resolve latest/);
    await assert.rejects(access(path.join(root, 'calls.jsonl')), { code: 'ENOENT' });
    await rm(file);
  }
});

test('worker image assets keep root tooling locked and worker Pi floating with verified build metadata', async () => {
  const worker = JSON.parse(await readFile('worker/package.json', 'utf8'));
  assert.equal(worker.dependencies['@earendil-works/pi-coding-agent'], 'latest');
  for (const lock of ['worker/npm-shrinkwrap.json', 'worker/package-lock.json']) await assert.rejects(access(lock), { code: 'ENOENT' });
  await access('npm-shrinkwrap.json');
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(manifest.scripts['build:image'], 'node scripts/build-image.mjs');
  const dockerfile = await readFile('worker/Dockerfile', 'utf8');
  assert.match(dockerfile, /ARG PI_VERSION\nRUN test -n "\$PI_VERSION"/);
  assert.match(dockerfile, /npm install --omit=dev --no-save --package-lock=false "@earendil-works\/pi-coding-agent@\$\{PI_VERSION\}"/);
  assert.match(dockerfile, /v !== process.argv\[1\]/);
  assert.match(dockerfile, /writeFileSync\("pi-version"/);
  assert.match(dockerfile, /LABEL org.pi-ax.pi.version=\$PI_VERSION/);
  assert.doesNotMatch(dockerfile, /worker\/npm-shrinkwrap|0\.99\.2/);
  assert.match(dockerfile, /COPY package.json npm-shrinkwrap.json/);
  const ignore = await readFile('.dockerignore', 'utf8');
  assert.doesNotMatch(ignore, /!worker\/(npm-shrinkwrap|package-lock).json/);
  assert.match(ignore, /!src\/credentials.ts/);
});
