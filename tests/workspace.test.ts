import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPatch, createSnapshot, decodeSnapshot, encodeSnapshot, materializeSnapshot, sha256, SNAPSHOT_LIMITS } from '../src/workspace.js';
import type { SnapshotFile, WorkspaceSnapshot } from '../src/workspace.js';

async function temp(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'pi-ax-workspace-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
function entry(name: string, text = 'content', mode: SnapshotFile['mode'] = 0o644): SnapshotFile {
  return { path: name, data: Buffer.from(text).toString('base64'), sha256: sha256(text), mode };
}
const snapshot = (files: SnapshotFile[]): WorkspaceSnapshot => ({ version: 1, files });

test('workspace snapshot captures working tree and new files, never host metadata or common secrets', async (t) => {
  const root = await temp(t);
  execFileSync('git', ['init', '-q', root]);
  await writeFile(path.join(root, 'tracked.ts'), 'original');
  execFileSync('git', ['-C', root, 'add', 'tracked.ts']);
  await writeFile(path.join(root, 'tracked.ts'), 'uncommitted modification');
  await writeFile(path.join(root, 'new.ts'), 'new file');
  await writeFile(path.join(root, 'AGENTS.md'), 'project instructions');
  const excluded = ['.env', '.env.example', '.env.production', 'auth.json', 'credentials.json', '.npmrc', 'private.pem', 'id_ed25519', '.pi/settings.json', '.git/config', 'node_modules/dependency/index.js', '.config/config', '.aws/credentials', '.pi-ax/state.json', 'secrets.yaml', 'vendor/lib/file', '.venv/config'];
  for (const file of excluded) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), 'EXCLUDED-SENTINEL'); }
  const indexBefore = await readFile(path.join(root, '.git/index'));
  const first = await createSnapshot(root);
  const second = await createSnapshot(root);
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.snapshot.files.map((f) => f.path), ['AGENTS.md', 'new.ts', 'tracked.ts']);
  assert.equal(Buffer.from(first.snapshot.files[2].data, 'base64').toString(), 'uncommitted modification');
  assert.equal(first.payload.includes(Buffer.from('EXCLUDED-SENTINEL').toString('base64')), false);
  assert.deepEqual(await readFile(path.join(root, '.git/index')), indexBefore);
  assert.deepEqual(decodeSnapshot(first.payload, first.sha256), first.snapshot);
});

test('workspace patch round trip includes binary additions/deletions, modes, symlinks, gitignored files and exact CRLF bytes', async (t) => {
  const root = await temp(t);
  const input = path.join(root, 'input'); await mkdir(input);
  await writeFile(path.join(input, 'existing.txt'), 'uncommitted input\r\n');
  await writeFile(path.join(input, 'delete.txt'), 'delete me');
  await writeFile(path.join(input, 'data.bin'), Buffer.from([0, 255, 1]));
  await writeFile(path.join(input, 'delete.bin'), Buffer.from([0, 127, 255]));
  await writeFile(path.join(input, '.gitignore'), 'new-ignored.txt\n');
  await writeFile(path.join(input, '.gitattributes'), '*.txt text eol=lf\n');
  await writeFile(path.join(input, 'run.sh'), '#!/bin/sh\n');
  await symlink('existing.txt', path.join(input, 'internal-link'));
  const baseline = await createSnapshot(input);
  const guest = path.join(root, 'guest'); await materializeSnapshot(baseline.snapshot, guest);
  await writeFile(path.join(guest, 'existing.txt'), 'changed\r\n');
  await rm(path.join(guest, 'delete.txt'));
  await rm(path.join(guest, 'delete.bin'));
  await rm(path.join(guest, 'internal-link'));
  await symlink('existing.txt', path.join(guest, 'new-link'));
  await writeFile(path.join(guest, 'data.bin'), Buffer.from([0, 255, 2]));
  await writeFile(path.join(guest, 'new.bin'), Buffer.from([0, 128, 3]));
  await writeFile(path.join(guest, 'new-ignored.txt'), 'must be included\r\n');
  await chmod(path.join(guest, 'run.sh'), 0o755);
  const final = await createSnapshot(guest);
  const patch = await createPatch(baseline.snapshot, final.snapshot);
  assert.match(patch.toString(), /GIT binary patch/);
  assert.match(patch.toString(), /deleted file mode/);
  assert.match(patch.toString(), /new-ignored.txt/);
  const applied = path.join(root, 'applied'); await materializeSnapshot(baseline.snapshot, applied);
  execFileSync('git', ['apply', '--binary', '--whitespace=nowarn', '-'], { cwd: applied, input: patch });
  assert.deepEqual((await createSnapshot(applied)).snapshot, final.snapshot);
  assert.equal((await lstat(path.join(applied, 'run.sh'))).mode & 0o777, 0o755);
  assert.deepEqual((await createSnapshot(input)).snapshot, baseline.snapshot);
  assert.equal((await createPatch(baseline.snapshot, baseline.snapshot)).length, 0);
});

test('workspace rejects outward and excluded-target symlinks without reading targets', async (t) => {
  const root = await temp(t); const input = path.join(root, 'input'); await mkdir(input);
  await writeFile(path.join(root, 'private'), 'SECRET');
  await symlink('../private', path.join(input, 'escape'));
  await assert.rejects(createSnapshot(input), /Unsafe/);
  await rm(path.join(input, 'escape'));
  await writeFile(path.join(input, '.env'), 'SECRET');
  await symlink('.env', path.join(input, 'escape'));
  await assert.rejects(createSnapshot(input), /Unsafe/);
});

test('workspace schema rejects traversal, duplicate/prefix entries, invalid modes/base64/hash and oversized inputs', async () => {
  for (const name of ['../escape', '/absolute', 'a/../b', 'a//b', '.git/config', 'C:drive', 'a\\b', 'a\nb', '.pi/auth.json']) {
    assert.throws(() => decodeSnapshot(encodeSnapshot(snapshot([entry(name)])).payload), /Unsafe/);
  }
  for (const files of [[entry('same'), entry('same')], [entry('a'), entry('a/b')], [entry('link', '../outside', 0o120000)]]) {
    assert.throws(() => decodeSnapshot(encodeSnapshot(snapshot(files)).payload));
  }
  for (const extra of [{ mode: 0o777 }, { data: 'invalid!' }, { sha256: '0'.repeat(64) }]) {
    assert.throws(() => decodeSnapshot(Buffer.from(JSON.stringify(snapshot([{ ...entry('a'), ...extra } as SnapshotFile])))));
  }
  assert.throws(() => decodeSnapshot(Buffer.alloc(SNAPSHOT_LIMITS.payloadBytes + 1)), /payload/);
  assert.throws(() => decodeSnapshot(encodeSnapshot(snapshot([])).payload, '0'.repeat(64)), /payload/);
});

test('workspace bounds sparse files and refuses to overwrite materialization destinations', async (t) => {
  const root = await temp(t); const file = path.join(root, 'oversize');
  await writeFile(file, ''); await truncate(file, SNAPSHOT_LIMITS.fileBytes + 1);
  await assert.rejects(createSnapshot(root), /limit/);
  await assert.rejects(materializeSnapshot(snapshot([]), root), /EEXIST/);
});

test('workspace protected file identity respects exclusions but rejects included hardlink and symlink aliases', async (t) => {
  const root = await temp(t);
  const input = path.join(root, 'input'); await mkdir(input);
  const cache = path.join(input, '.cache'); await mkdir(cache);
  const token = path.join(cache, 'native-token');
  await writeFile(token, 'synthetic-protected-token', { mode: 0o600 });
  await writeFile(path.join(input, 'source.txt'), 'normal source');
  const safe = await createSnapshot(input, [token]);
  assert.deepEqual(safe.snapshot.files.map((f) => f.path), ['source.txt']);
  assert.equal(Buffer.from(safe.snapshot.files[0].data, 'base64').toString(), 'normal source');
  const alias = path.join(input, 'ordinary-data');
  await link(token, alias);
  await assert.rejects(createSnapshot(input, [token]), /protected file/i);
  // Check a symlink to an otherwise includable hardlink before walking its target.
  await symlink('ordinary-data', path.join(input, 'a-link'));
  await assert.rejects(createSnapshot(input, [token]), /protected file/i);
  await rm(alias); await rm(path.join(input, 'a-link'));
  await symlink('.cache/native-token', alias);
  await assert.rejects(createSnapshot(input, [token]), /Unsafe/, 'existing excluded-target symlink guard stays intact');
  await rm(alias);
  await assert.rejects(createSnapshot(input, [path.join(root, 'absent')]), /^Error: Cannot identify protected snapshot file$/);
  assert.equal(await readFile(token, 'utf8'), 'synthetic-protected-token');
});
