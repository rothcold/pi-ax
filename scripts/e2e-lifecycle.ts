import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { acquireLock, atomicWrite, boundedRead, privateDirectory } from '../src/task-store.js';
import { sha256 } from '../src/workspace.js';
import { AxRpcError } from '../src/ax/client.js';
import { EgressRpcError } from '../src/ax/egress-client.js';

export type EvidenceSave = (name: string, value: unknown) => Promise<void>;
interface OwnedE2E {
  root: string; output: string; mode: 'wire' | 'sqlite'; identity: object;
  execute(save: EvidenceSave): Promise<void>;
  archive(save: EvidenceSave): Promise<{ terminal: boolean; files: string[] }>;
  destroy(save: EvidenceSave): Promise<void>;
  confirm(save: EvidenceSave): Promise<void>;
}

/** One unresolved local harness run, independent of evidence directory and mode. */
export async function runOwnedE2E(options: OwnedE2E): Promise<void> {
  await privateDirectory(options.root);
  const release = await acquireLock(path.join(options.root, 'ownership.lock'));
  const file = path.join(options.root, 'owner.json');
  const save: EvidenceSave = async (name, value) => {
    if (path.basename(name) !== name) throw new Error('Invalid evidence filename');
    await atomicWrite(path.join(options.output, name), JSON.stringify(value, null, 2) + '\n');
  };
  try {
    try {
      const previous = JSON.parse((await boundedRead(file, 64 * 1024)).toString());
      if (previous.version !== 1 || previous.stage !== 'cleaned') throw new Error('E2E ownership unresolved; inspect owner.json and reconcile before another create');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await mkdir(options.output, { mode: 0o700 });
    await privateDirectory(options.output); // Persist the fresh directory entry before intent or remote effects.
    const owner = { version: 1, mode: options.mode, output: options.output, identity: options.identity, stage: 'intent', createdAt: new Date().toISOString() };
    const stage = async (value: string) => { owner.stage = value; await atomicWrite(file, JSON.stringify(owner, null, 2)); };
    await save('intent.json', owner);
    // This fsynced singleton points to the dedicated SQLite store before spawn can issue CreateTask.
    await stage('intent');
    let failed = false;
    let failure: unknown;
    try { await options.execute(save); } catch (error) { failed = true; failure = error; }
    await save('diagnostic.json', { execution: failed ? 'failed' : 'passed',
      rpc: failure instanceof AxRpcError || failure instanceof EgressRpcError ? { operation: failure.operation, code: failure.code } : null,
      note: failed ? 'Execution/assertion failed; see exported status and artifacts. No automatic replay.' : 'Execution checks passed; archive and cleanup still required.' });
    try {
      await stage('exporting');
      const archive = await options.archive(save);
      if (!archive.terminal) throw new Error('Termination or export incomplete');
      const files = [];
      for (const name of [...new Set([...archive.files, 'diagnostic.json'])]) {
        if (path.isAbsolute(name) || name.split(path.sep).includes('..')) throw new Error('Invalid archive path');
        const data = await boundedRead(path.join(options.output, name), 128 * 1024 * 1024);
        // Re-persist and read back before marking the archive ready, including files produced by other helpers.
        await atomicWrite(path.join(options.output, name), data);
        const hash = sha256(data);
        if (sha256(await boundedRead(path.join(options.output, name), data.length)) !== hash) throw new Error('Archive verification failed');
        files.push({ name, bytes: data.length, sha256: hash });
      }
      if (!archive.files.length) throw new Error('Empty archive');
      await save('archive.json', { version: 1, complete: true, files });
      await stage('delete_requested');
      await options.destroy(save);
      await stage('confirming');
      await options.confirm(save);
      await save('cleanup.json', { confirmed: true, at: new Date().toISOString(), note: 'Owned AX task, native actor, template and golden actor absent. Local evidence retained.' });
      await stage('cleaned');
    } catch (error) {
      await save('cleanup.json', { confirmed: false, stage: owner.stage,
        rpc: error instanceof AxRpcError || error instanceof EgressRpcError ? { operation: error.operation, code: error.code } : null,
        note: 'Retained ownership blocks both E2E modes, including fresh output paths. Reconcile explicitly; never replay an uncertain create/start/delete.' });
      throw new Error('E2E archive/cleanup unresolved; retained ownership and diagnostic evidence');
    }
    if (failed) throw new Error('E2E failed; verified evidence retained and owned remote cleanup confirmed');
  } finally { await release(); }
}

/** Operator-invoked read-only recovery after a delete/confirmation interruption; never repeats DeleteTask. */
export async function reconcileOwnedE2E(root: string, confirm: (owner: { output: string; identity: Record<string, unknown> }, save: EvidenceSave) => Promise<void>): Promise<void> {
  await privateDirectory(root);
  const release = await acquireLock(path.join(root, 'ownership.lock'));
  try {
    const file = path.join(root, 'owner.json');
    const owner = JSON.parse((await boundedRead(file, 64 * 1024)).toString());
    if (owner.version !== 1 || !['delete_requested', 'confirming'].includes(owner.stage) || typeof owner.output !== 'string' || !path.isAbsolute(owner.output) || !owner.identity) throw new Error('Only an archived delete intent can be reconciled; retain unresolved resources for explicit operator recovery');
    await privateDirectory(owner.output);
    const manifest = JSON.parse((await boundedRead(path.join(owner.output, 'archive.json'), 1024 * 1024)).toString());
    if (manifest.version !== 1 || manifest.complete !== true || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Verified archive required');
    for (const entry of manifest.files) {
      if (typeof entry.name !== 'string' || path.isAbsolute(entry.name) || entry.name.split(path.sep).includes('..')) throw new Error('Invalid archive file');
      const data = await boundedRead(path.join(owner.output, entry.name), 128 * 1024 * 1024);
      if (data.length !== entry.bytes || sha256(data) !== entry.sha256) throw new Error('Archive verification failed');
    }
    const save: EvidenceSave = async (name, value) => {
      if (path.basename(name) !== name) throw new Error('Invalid evidence filename');
      await atomicWrite(path.join(owner.output, name), JSON.stringify(value, null, 2) + '\n');
    };
    try { await confirm(owner, save); }
    catch {
      await save('reconciliation.json', { confirmed: false, note: 'Readback did not establish absence; no delete replay and ownership retained.' });
      throw new Error('Reconciliation unresolved');
    }
    await save('cleanup.json', { confirmed: true, reconciledAt: new Date().toISOString(), note: 'Explicit read-only reconciliation confirmed owned resources absent; archive reverified.' });
    owner.stage = 'cleaned';
    await atomicWrite(file, JSON.stringify(owner, null, 2));
  } finally { await release(); }
}
