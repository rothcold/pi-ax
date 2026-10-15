import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readlink, readdir, realpath, rm, stat as fileStat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SNAPSHOT_LIMITS = { files: 10_000, fileBytes: 8 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, payloadBytes: 48 * 1024 * 1024 } as const;
export interface SnapshotFile { path: string; mode: 0o644 | 0o755 | 0o120000; data: string; sha256: string }
export interface WorkspaceSnapshot { version: 1; files: SnapshotFile[] }
export interface SnapshotPayload { snapshot: WorkspaceSnapshot; payload: Buffer; sha256: string }
export const sha256 = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');

const excludedNames = new Set([
  '.git', '.pi', '.pi-ax', '.ssh', '.aws', '.azure', '.gcloud', '.config', '.kube', '.docker', '.gnupg',
  'node_modules', 'vendor', '.venv', 'venv', '__pycache__', '.cache', '.npm', '.bun', '.yarn', '.pnpm-store',
  'coverage', 'dist', 'build', 'target', '.next', '.nuxt', '.turbo', '.DS_Store',
  '.npmrc', '.yarnrc', '.yarnrc.yml', '.netrc', '.gitconfig', '.git-credentials', '.pypirc',
  'auth.json', 'credentials.json', 'credentials', 'secrets.json', 'secrets.yaml', 'secrets.yml',
]);
/** Conservative name filter, not secret detection. Applied to every path component, independent of gitignore. */
export function isExcludedPath(value: string): boolean {
  return value.split('/').some((part) => excludedNames.has(part) || /^\.env(?:\.|$)/i.test(part)
    || /\.(?:pem|key|p12|pfx|keystore|log)$/i.test(part) || /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/.test(part)
    || /^(?:service[-_]?account|credentials|secrets)[._-]/i.test(part));
}
export function validateWorkspacePath(value: string): void {
  if (!value || Buffer.byteLength(value) > 4096 || /[\\\x00-\x1f\x7f:]/.test(value)
    || value.split('/').some((p) => !p || p === '.' || p === '..') || isExcludedPath(value)) {
    throw new Error('Unsafe or excluded workspace path');
  }
}
function validateLink(name: string, target: string): void {
  if (!target || Buffer.byteLength(target) > 4096 || path.posix.isAbsolute(target) || /[\\\x00-\x1f\x7f:]/.test(target)) throw new Error('Unsafe workspace symlink');
  validateWorkspacePath(path.posix.normalize(path.posix.join(path.posix.dirname(name), target)));
}
function inside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}
export function encodeSnapshot(snapshot: WorkspaceSnapshot): SnapshotPayload {
  const payload = Buffer.from(JSON.stringify(snapshot));
  if (payload.length > SNAPSHOT_LIMITS.payloadBytes) throw new Error('Snapshot payload limit exceeded');
  return { snapshot, payload, sha256: sha256(payload) };
}
export function decodeSnapshot(payload: Uint8Array, expectedHash?: string): WorkspaceSnapshot {
  if (payload.byteLength > SNAPSHOT_LIMITS.payloadBytes || (expectedHash && sha256(payload) !== expectedHash)) throw new Error('Invalid snapshot payload');
  const value: unknown = JSON.parse(Buffer.from(payload).toString('utf8'));
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('files' in value) || !Array.isArray(value.files) || value.files.length > SNAPSHOT_LIMITS.files) throw new Error('Invalid snapshot schema');
  const files: SnapshotFile[] = [];
  const names = new Set<string>();
  let bytes = 0;
  for (const entry of value.files) {
    if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.data !== 'string'
      || typeof entry.sha256 !== 'string' || ![0o644, 0o755, 0o120000].includes(entry.mode)) throw new Error('Invalid snapshot file');
    validateWorkspacePath(entry.path);
    if (names.has(entry.path)) throw new Error('Duplicate snapshot path');
    names.add(entry.path);
    const data = Buffer.from(entry.data, 'base64');
    bytes += data.length;
    if (data.toString('base64') !== entry.data || sha256(data) !== entry.sha256 || data.length > SNAPSHOT_LIMITS.fileBytes || bytes > SNAPSHOT_LIMITS.totalBytes) throw new Error('Invalid snapshot content or size');
    if (entry.mode === 0o120000) {
      const target = data.toString('utf8');
      if (!Buffer.from(target).equals(data)) throw new Error('Invalid symlink encoding');
      validateLink(entry.path, target);
    }
    files.push({ path: entry.path, mode: entry.mode, data: entry.data, sha256: entry.sha256 });
  }
  for (const name of names) {
    let parent = path.posix.dirname(name);
    while (parent !== '.') {
      if (names.has(parent)) throw new Error('Snapshot file/directory conflict');
      parent = path.posix.dirname(parent);
    }
  }
  return { version: 1, files: files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
}

/** Reads the working tree, not HEAD/index. Protected identities and unsafe links fail closed, not silently omit source. */
export async function createSnapshot(directory: string, protectedFiles: readonly string[] = []): Promise<SnapshotPayload> {
  const root = await realpath(directory);
  // Resolve configured symlinks and compare device/inode too: an external file may
  // have an ordinary hardlink name inside the tree. No protected contents are read.
  async function identify(file: string) {
    try {
      const resolved = await realpath(file);
      const stat = await fileStat(resolved);
      if (!stat.isFile()) throw new Error();
      return { file, resolved, stat };
    } catch { throw new Error('Cannot identify protected snapshot file'); }
  }
  const protectedIdentities = await Promise.all(protectedFiles.map(identify));
  function checkProtected(resolved: string, stat: Stats): void {
    if (protectedIdentities.some((p) => p.resolved === resolved || (p.stat.dev === stat.dev && p.stat.ino === stat.ino))) {
      throw new Error('Snapshot would include a protected file; keep scoped credentials outside included source');
    }
  }
  const files: SnapshotFile[] = [];
  let total = 0;
  let visited = 0;
  async function walk(relative: string): Promise<void> {
    const absolute = path.join(root, relative);
    if (!inside(root, await realpath(absolute))) throw new Error('Workspace escaped snapshot root');
    for (const name of (await readdir(absolute)).sort()) {
      if (++visited > SNAPSHOT_LIMITS.files * 4) throw new Error('Snapshot entry limit exceeded');
      const rel = relative ? `${relative}/${name}` : name;
      if (isExcludedPath(rel)) continue;
      validateWorkspacePath(rel);
      const full = path.join(root, rel);
      const stat = await lstat(full);
      if (stat.isDirectory()) { await walk(rel); continue; }
      let data: Buffer;
      let mode: SnapshotFile['mode'];
      if (stat.isSymbolicLink()) {
        const target = await readlink(full);
        validateLink(rel, target);
        const resolved = await realpath(full);
        if (!inside(root, resolved) || isExcludedPath(path.relative(root, resolved))) throw new Error('Outward or excluded workspace symlink');
        if (protectedIdentities.length) checkProtected(resolved, await fileStat(resolved));
        data = Buffer.from(target); mode = 0o120000;
      } else if (stat.isFile()) {
        if (stat.size > SNAPSHOT_LIMITS.fileBytes) throw new Error('Snapshot file limit exceeded');
        const handle = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const before = await handle.stat();
          // Verify opened inode as well as parents; never follow a replaced file symlink.
          const resolved = await realpath(full);
          if (before.ino !== stat.ino || before.dev !== stat.dev || !inside(root, resolved)) throw new Error('Workspace changed during snapshot');
          checkProtected(resolved, before);
          data = Buffer.alloc(Math.min(before.size + 1, SNAPSHOT_LIMITS.fileBytes + 1));
          let read = 0;
          while (read < data.length) {
            const result = await handle.read(data, read, data.length - read, read);
            if (!result.bytesRead) break;
            read += result.bytesRead;
          }
          data = data.subarray(0, read);
          const after = await handle.stat();
          if (read !== before.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Workspace changed during snapshot');
          mode = (before.mode & 0o111) ? 0o755 : 0o644;
        } finally { await handle.close(); }
      } else { throw new Error('Unsupported workspace file type'); }
      total += data.length;
      if (files.length >= SNAPSHOT_LIMITS.files || total > SNAPSHOT_LIMITS.totalBytes || data.length > SNAPSHOT_LIMITS.fileBytes) throw new Error('Snapshot size limit exceeded');
      files.push({ path: rel, mode, data: data.toString('base64'), sha256: sha256(data) });
    }
  }
  await walk('');
  for (const before of protectedIdentities) {
    const after = await identify(before.file);
    if (before.resolved !== after.resolved || before.stat.dev !== after.stat.dev || before.stat.ino !== after.stat.ino ||
        before.stat.mtimeMs !== after.stat.mtimeMs || before.stat.ctimeMs !== after.stat.ctimeMs) {
      throw new Error('Protected file changed during snapshot');
    }
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return encodeSnapshot({ version: 1, files });
}

/** Destination must not exist; no archive extraction or overwriting an existing tree. */
export async function materializeSnapshot(snapshot: WorkspaceSnapshot, destination: string): Promise<void> {
  const validated = decodeSnapshot(encodeSnapshot(snapshot).payload);
  await mkdir(destination, { mode: 0o700 });
  for (const file of validated.files) {
    const full = path.join(destination, file.path);
    await mkdir(path.dirname(full), { recursive: true, mode: 0o755 });
    const data = Buffer.from(file.data, 'base64');
    if (file.mode === 0o120000) await symlink(data.toString('utf8'), full);
    else { await writeFile(full, data, { flag: 'wx', mode: file.mode }); await chmod(full, file.mode); }
  }
}

/** Separate disposable git object store; neither host index nor worker git metadata are used. No commits. */
export async function createPatch(baseline: WorkspaceSnapshot, result: WorkspaceSnapshot): Promise<Buffer> {
  const scratch = await mkdtemp(path.join(tmpdir(), 'pi-ax-patch-'));
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: scratch, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_DIR: path.join(scratch, 'objects.git'), GIT_INDEX_FILE: path.join(scratch, 'index'), LC_ALL: 'C' };
  const git = (args: string[], input?: Buffer | string): Buffer => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { env, cwd: scratch, input, maxBuffer: 64 * 1024 * 1024, timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    git(['init', '--bare', '--quiet', env.GIT_DIR]);
    const blobs = new Map<string, string>();
    function tree(snapshot: WorkspaceSnapshot): string {
      const safe = decodeSnapshot(encodeSnapshot(snapshot).payload);
      git(['read-tree', '--empty']);
      const index: string[] = [];
      for (const file of safe.files) {
        let object = blobs.get(file.sha256);
        if (!object) { object = git(['hash-object', '-w', '--no-filters', '--stdin'], Buffer.from(file.data, 'base64')).toString().trim(); blobs.set(file.sha256, object); }
        index.push(`${file.mode === 0o120000 ? '120000' : file.mode === 0o755 ? '100755' : '100644'} ${object}\t${file.path}\0`);
      }
      git(['update-index', '-z', '--index-info'], index.join(''));
      return git(['write-tree']).toString().trim();
    }
    return git(['diff-tree', '--no-commit-id', '-p', '--binary', '--full-index', '--no-renames', '--no-ext-diff', '--no-textconv', tree(baseline), tree(result)]);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
