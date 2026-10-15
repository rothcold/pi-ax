import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Check } from 'typebox/value';
import { TASK_ID_PATTERN, TaskRecordSchema, type TaskRecord } from './task-schema.js';

const taskIdPattern = new RegExp(TASK_ID_PATTERN);

export class TaskBusyError extends Error {
  constructor() { super('Task operation is busy; query again without spawning a replacement task'); }
}

/** Linux flock releases on process/pipe death; never expires a live owner's lease. */
export async function acquireLock(file: string): Promise<() => Promise<void>> {
  const handle = await open(file, constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  await handle.close();
  const child = spawn('flock', ['--exclusive', '--nonblock', '--conflict-exit-code', '75', file,
    process.execPath, '-e', "process.stdout.write('locked\\n'); process.stdin.resume();"], {
    stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' },
  });
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  await new Promise<void>((resolve, reject) => {
    child.once('error', () => reject(new Error('Cannot launch required Linux flock utility')));
    child.once('exit', (code) => reject(code === 75 ? new TaskBusyError() : new Error('Local task lock failed')));
    child.stdout.once('data', () => resolve());
  });
  let released = false;
  return async () => { if (!released) { released = true; child.stdin.end(); await exited; } };
}

export async function privateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) {
    throw new Error('Task storage must be an owned private directory (0700), not a symlink');
  }
  // Also persist the directory entry before any external task identity depends on it.
  const parent = await open(path.dirname(directory), 'r');
  try { await parent.sync(); } finally { await parent.close(); }
}

export async function atomicWrite(file: string, data: Uint8Array | string): Promise<void> {
  const tmp = `${file}.${randomUUID()}.tmp`;
  const handle = await open(tmp, 'wx', 0o600);
  try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
  try {
    await rename(tmp, file);
    const dir = await open(path.dirname(file), 'r');
    try { await dir.sync(); } finally { await dir.close(); }
  } finally { await unlink(tmp).catch(() => {}); }
}

export async function boundedRead(file: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Invalid local task file');
    const buffer = Buffer.alloc(maxBytes + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const read = await handle.read(buffer, bytes, buffer.length - bytes, null);
      if (!read.bytesRead) break;
      bytes += read.bytesRead;
    }
    if (bytes > maxBytes) throw new Error('Local task file exceeds bound');
    return buffer.subarray(0, bytes);
  } finally { await handle.close(); }
}

export class TaskStore {
  constructor(readonly root: string) {
    if (!path.isAbsolute(root)) throw new Error('Task stateDir must be absolute');
  }
  async initialize(): Promise<void> { await privateDirectory(this.root); }
  directory(id: string): string {
    if (!taskIdPattern.test(id)) throw new Error('Invalid task identity');
    return path.join(this.root, id);
  }
  async reserve<T>(work: () => Promise<T>): Promise<T> {
    await this.initialize();
    const release = await acquireLock(path.join(this.root, 'reservation.lock'));
    try { return await work(); } finally { await release(); }
  }
  async lock(id: string): Promise<() => Promise<void>> {
    await lstat(this.directory(id)); // A mistyped ID must not create an orphan ledger directory.
    await privateDirectory(this.directory(id));
    return acquireLock(path.join(this.directory(id), 'operation.lock'));
  }
  async read(id: string): Promise<TaskRecord> {
    await this.initialize();
    await lstat(this.directory(id));
    await privateDirectory(this.directory(id));
    const value: unknown = JSON.parse((await boundedRead(path.join(this.directory(id), 'task.json'), 64 * 1024)).toString());
    if (!Check(TaskRecordSchema, value) || value.view.taskId !== id) throw new Error('Invalid persisted task record; refusing unsafe recovery');
    if (value.view.terminationConfirmed === undefined) {
      value.view.terminationConfirmed = false;
      // Legacy v1 records inferred job completion from wrapper exit alone. Re-open
      // their reservation before spawn checks the ledger, not only during status.
      if (value.startAttempted && value.view.state !== 'destroyed') {
        value.view.active = true; value.view.cancellationConfirmed = false; value.view.archiveComplete = false;
        value.view.state = value.view.processState === 'running' ? 'running' : 'unknown';
      }
    }
    return value;
  }
  async write(record: TaskRecord): Promise<void> {
    record.view.updatedAt = new Date().toISOString();
    if (!Check(TaskRecordSchema, record)) throw new Error('Invalid task state');
    await atomicWrite(path.join(this.directory(record.view.taskId), 'task.json'), JSON.stringify(record, null, 2));
  }
  async list(): Promise<TaskRecord[]> {
    await this.initialize();
    const entries = await readdir(this.root);
    const result: TaskRecord[] = [];
    for (const name of entries.sort()) {
      if (taskIdPattern.test(name)) result.push(await this.read(name));
    }
    return result;
  }
}
