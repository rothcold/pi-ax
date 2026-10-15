import { TaskManager } from '../../src/task-manager.js';
import { TaskStore, acquireLock } from '../../src/task-store.js';
import type { TaskTransport } from '../../src/task-manager.js';

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { egressFixture } from './egress-config.js';

const [mode, root, cwd] = process.argv.slice(2);
if (mode === 'lock') {
  const release = await acquireLock(root);
  process.stdout.write('locked\n');
  process.stdin.resume();
  process.stdin.on('end', () => { void release(); });
} else {
  const credentials = mkdtempSync(path.join(os.tmpdir(), 'pi-ax-reserve-egress-'));
  const egress = egressFixture(credentials);
  const manager = new TaskManager({
    store: new TaskStore(root),
    config: () => ({ controlAddress: 'localhost:1', routerAddress: 'localhost:2', atespace: 'unit', workerImage: 'unit', workerProvider: 'unit', workerModel: 'unit', credentialEnv: [], egress }),
    egressClient: () => ({ async createPolicy() { throw new Error('fixture never reaches policy'); }, async getPolicy() { throw new Error('fixture never gets policy'); }, close() {} }),
    // Halt in create for this reservation-only process fixture; no wire server or AX E2E.
    transport: () => ({ createTask: (_ref, _image, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('fixture shutdown')), { once: true });
      if (options?.signal?.aborted) reject(new Error('fixture shutdown'));
    }), close() {} }) as TaskTransport,
  });
  try { const result = await manager.spawn('fixture', cwd); process.stdout.write(`accepted ${result.taskId}\n`); }
  catch { process.stdout.write('rejected\n'); }
  await manager.close();
  rmSync(credentials, { recursive: true, force: true });
}
