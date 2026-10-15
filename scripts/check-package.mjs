import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = process.cwd();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-package-'));
function run(command, args, options = {}) {
  const child = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, ...options });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, `${command} failed:\n${child.stdout}\n${child.stderr}`);
  return child.stdout;
}
try {
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary]));
  const names = new Set(packed.files.map((file) => file.path));
  for (const required of ['LICENSE', 'ax-config.example.json', 'src/credentials.ts', 'src/extension.ts', 'src/ax/protocol.ts', 'proto/ax/v1alpha1/ax.proto', 'proto/ateenv/v1alpha/guest.proto', 'proto/LICENSE', 'proto/PROVENANCE.md', 'proto/ateapi/ateapi.proto', 'worker/PROVENANCE.md', 'worker/run.ts', 'worker/supervise.c', 'scripts/build-worker.mjs', 'worker/Dockerfile', 'worker/package.json', 'scripts/build-image.mjs', 'npm-shrinkwrap.json', '.dockerignore', 'scripts/local-ax.sh']) assert(names.has(required), `Missing package asset: ${required}`);
  for (const lock of ['worker/npm-shrinkwrap.json', 'worker/package-lock.json']) assert(!names.has(lock), `Obsolete worker lock in package: ${lock}`);
  for (const name of names) assert(!/(^|\/)(node_modules|\.cache|\.git|\.env(?:\.[^/]*)?|ax-config\.json)(\/|$)/.test(name), `Private/build artifact in package: ${name}`);
  run('tar', ['-xzf', path.join(temporary, packed.filename), '-C', temporary]);
  const extracted = path.join(temporary, 'package');
  // Reuse already lock-verified dependencies; package source/protos come only from the tarball.
  await symlink(path.join(root, 'node_modules'), path.join(extracted, 'node_modules'), 'dir');
  await mkdir(path.join(temporary, 'home')); await mkdir(path.join(temporary, 'cwd'));
  const cleanEnv = { PATH: '/usr/bin:/bin', HOME: path.join(temporary, 'home'), PI_CODING_AGENT_DIR: path.join(temporary, 'home', 'agent'), PI_OFFLINE: '1', PI_TELEMETRY: 'off' };
  const manifest = JSON.parse(await readFile(path.join(extracted, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'pi-ax');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, 'MIT');
  assert.equal(typeof manifest.description, 'string');
  assert(manifest.description.trim().length > 0);
  assert.deepEqual(manifest.repository, { type: 'git', url: 'git+https://github.com/rothcold/pi-ax.git' });
  assert.equal(manifest.homepage, 'https://github.com/rothcold/pi-ax#readme');
  assert.deepEqual(manifest.bugs, { url: 'https://github.com/rothcold/pi-ax/issues' });
  assert(manifest.keywords.includes('pi-package'));
  assert.deepEqual(manifest.pi.extensions, ['./src/extension.ts']);
  assert.deepEqual(manifest.peerDependencies, { '@earendil-works/pi-coding-agent': '*', typebox: '*' });
  for (const peer of Object.keys(manifest.peerDependencies)) assert(!(peer in manifest.dependencies), `Bundled host peer: ${peer}`);
  const lock = JSON.parse(await readFile(path.join(extracted, 'npm-shrinkwrap.json'), 'utf8'));
  for (const key of ['name', 'version', 'license', 'dependencies', 'devDependencies', 'peerDependencies', 'engines']) assert.deepEqual(lock.packages[''][key], manifest[key], `Root shrinkwrap mismatch: ${key}`);
  assert.match(await readFile(path.join(extracted, 'LICENSE'), 'utf8'), /^MIT License\n/);
  assert.match(await readFile(path.join(extracted, 'proto/LICENSE'), 'utf8'), /Apache License\s+Version 2\.0/);
  for (const proto of ['ax/v1alpha1/ax.proto', 'ateenv/v1alpha/guest.proto', 'ateapi/ateapi.proto']) {
    assert.match(await readFile(path.join(extracted, 'proto', proto), 'utf8'), /Licensed under the Apache License, Version 2\.0/);
  }
  const output = run(process.execPath, [path.join(extracted, 'scripts/pi-load-probe.mjs'), extracted], { cwd: path.join(temporary, 'cwd'), env: cleanEnv });
  process.stdout.write(output);
  console.log(`Package ${packed.filename}: ${names.size} allowlisted assets, root npm shrinkwrap, floating worker recipe and vendored protos verified.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
