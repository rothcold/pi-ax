import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import { once } from 'node:events';
import path from 'node:path';
import test from 'node:test';
import { runOwnedE2E, reconcileOwnedE2E, type EvidenceSave } from '../scripts/e2e-lifecycle.js';

test('E2E archives and verifies before delete, including a terminal model failure; wire shares the gate', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-e2e-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const mode of ['wire', 'sqlite'] as const) {
    const output = path.join(root, mode);
    const order: string[] = [];
    const run = runOwnedE2E({ root: path.join(root, 'ownership'), output, mode, identity: { atespace: 'test', name: 'owned' },
      async execute(save: EvidenceSave) { order.push('create'); await save('result.json', { failed: mode === 'sqlite' }); if (mode === 'sqlite') throw new Error('sensitive model failure'); },
      async archive() { order.push('archive'); return { terminal: true, files: ['result.json'] }; },
      async destroy() { const manifest = JSON.parse(await readFile(path.join(output, 'archive.json'), 'utf8')); assert.equal(manifest.files.length, 2); order.push('delete'); },
      async confirm() { order.push('confirm'); },
    });
    if (mode === 'sqlite') await assert.rejects(run, /E2E failed/); else await run;
    assert.deepEqual(order, ['create', 'archive', 'delete', 'confirm']);
    assert.equal(JSON.parse(await readFile(path.join(root, 'ownership/owner.json'), 'utf8')).stage, 'cleaned');
    assert(!(await readFile(path.join(output, 'diagnostic.json'), 'utf8')).includes('sensitive'));
  }
});

test('export or termination uncertainty and unknown delete retain ownership across different outputs/modes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-e2e-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const failure of ['export', 'termination', 'delete', 'confirm']) {
    const ownership = path.join(root, failure);
    let creates = 0, deletes = 0;
    const options = { root: ownership, mode: 'sqlite' as const, output: path.join(root, `${failure}-first`), identity: { stateDir: '/dedicated/state' },
      async execute(save: (name: string, value: unknown) => Promise<void>) { creates++; await save('result.json', {}); },
      async archive() { if (failure === 'export') throw new Error('secret'); return { terminal: failure !== 'termination', files: ['result.json'] }; },
      async destroy() { deletes++; if (failure === 'delete') throw new Error('lost reply'); },
      async confirm() { if (failure === 'confirm') throw new Error('actor remains'); },
    };
    await assert.rejects(runOwnedE2E(options));
    await assert.rejects(runOwnedE2E({ ...options, mode: 'wire', output: path.join(root, `${failure}-second`) }), /unresolved/);
    assert.equal(creates, 1); assert.equal(deletes, ['delete', 'confirm'].includes(failure) ? 1 : 0);
  }
});

test('real process flock excludes a second creating process; crash retains durable intent', async (t) => {
  const { spawn } = await import('node:child_process');
  const { writeFile } = await import('node:fs/promises');
  const { pathToFileURL } = await import('node:url');
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-e2e-lock-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = path.join(root, 'process.mjs');
  await writeFile(script, `import { runOwnedE2E } from ${JSON.stringify(pathToFileURL(path.resolve('scripts/e2e-lifecycle.ts')).href)};
await runOwnedE2E({root:process.argv[2],output:process.argv[3],mode:'wire',identity:{ref:{atespace:'test',name:'owned'}},
execute:async()=>{console.log('CREATED');await new Promise(()=>{setInterval(()=>{},1000)});},archive:async()=>({terminal:false,files:[]}),destroy:async()=>{},confirm:async()=>{}}).catch(()=>{console.log('BLOCKED');process.exitCode=1});`);
  const start = (output: string) => spawn(process.execPath, ['--import', 'tsx', script, path.join(root, 'ownership'), path.join(root, output)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const first = start('first');
  t.after(() => first.kill('SIGKILL'));
  const [data] = await once(first.stdout, 'data'); assert.match(String(data), /CREATED/);
  const second = start('second'); let text = ''; second.stdout.on('data', (data) => { text += data; });
  assert.equal((await once(second, 'exit'))[0], 1); assert.match(text, /BLOCKED/); assert.doesNotMatch(text, /CREATED/);
  first.kill('SIGKILL'); await once(first, 'exit');
  // flock's pipe owner exits asynchronously, but either lock contention or persisted intent must block.
  const third = start('third'); text = ''; third.stdout.on('data', (data) => { text += data; });
  assert.equal((await once(third, 'exit'))[0], 1); assert.match(text, /BLOCKED/); assert.doesNotMatch(text, /CREATED/);
  assert.equal(JSON.parse(await readFile(path.join(root, 'ownership/owner.json'), 'utf8')).output, path.join(root, 'first'));
});

test('explicit reconciliation only releases verified archives after readback; no replay on lost delete', async (t) => {
  const { writeFile } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-reconcile-')); t.after(() => rm(root, { recursive: true, force: true }));
  const ownership = path.join(root, 'ownership'); const output = path.join(root, 'output');
  let deletes = 0, reads = 0;
  await assert.rejects(runOwnedE2E({ root: ownership, output, mode: 'wire', identity: { ref: 'fixture' },
    async execute(save) { await save('evidence.json', { verified: true }); },
    async archive() { return { terminal: true, files: ['evidence.json'] }; },
    async destroy() { deletes++; throw new Error('lost'); }, async confirm() { throw new Error('not reached'); },
  }));
  await assert.rejects(reconcileOwnedE2E(ownership, async () => { reads++; throw new Error('still exists'); }));
  const data = await readFile(path.join(output, 'evidence.json'));
  await writeFile(path.join(output, 'evidence.json'), 'corrupt');
  await assert.rejects(reconcileOwnedE2E(ownership, async () => { reads++; }));
  assert.equal(reads, 1);
  await writeFile(path.join(output, 'evidence.json'), data);
  await reconcileOwnedE2E(ownership, async (owner) => { reads++; assert.equal(owner.output, output); });
  assert.equal(deletes, 1); assert.equal(reads, 2);
  assert.equal(JSON.parse(await readFile(path.join(ownership, 'owner.json'), 'utf8')).stage, 'cleaned');
});

test('fresh evidence parent fsync precedes intent/create; durability failure cannot create or delete', async (t) => {
  const fs = (await import('node:fs/promises')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-durable-output-'));
  const parent = path.join(root, 'evidence'); await fs.mkdir(parent);
  const ownership = path.join(root, 'ownership');
  const order: string[] = [];
  let failSync = true, complete = true;
  const open = fs.open;
  t.mock.method(fs, 'open', async (...args: Parameters<typeof open>) => {
    const handle = await open(...args);
    if (args[0] === parent) {
      const sync = handle.sync.bind(handle);
      t.mock.method(handle, 'sync', async () => {
        order.push('parent-sync');
        await assert.rejects(readFile(path.join(ownership, 'owner.json')), { code: 'ENOENT' });
        if (failSync) throw Object.assign(new Error('Injected output parent durability failure'), { code: 'EIO' });
        await sync();
      });
    }
    return handle;
  });
  syncBuiltinESMExports();
  try {
    const options = { root: ownership, output: path.join(parent, 'first'), mode: 'wire' as const, identity: { ref: 'fixture' },
      async execute(save: EvidenceSave) {
        order.push('create');
        assert.equal(JSON.parse(await readFile(path.join(ownership, 'owner.json'), 'utf8')).stage, 'intent');
        await save('result.json', { terminal: true });
      },
      async archive() { return { terminal: complete, files: ['result.json'] }; },
      async destroy() { order.push('delete'); }, async confirm() {},
    };
    await assert.rejects(runOwnedE2E(options), { code: 'EIO' });
    assert.deepEqual(order, ['parent-sync']);
    await assert.rejects(readFile(path.join(options.output, 'intent.json')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(ownership, 'owner.json')), { code: 'ENOENT' });
    failSync = false; complete = false;
    await assert.rejects(runOwnedE2E(options), { code: 'EEXIST' }); // Freshness still required after local failure.
    await assert.rejects(runOwnedE2E({ ...options, output: path.join(parent, 'second') }), /unresolved/);
    assert.deepEqual(order, ['parent-sync', 'parent-sync', 'create']);
    await assert.rejects(runOwnedE2E({ ...options, output: path.join(parent, 'third') }), /unresolved/);
    assert.equal(JSON.parse(await readFile(path.join(ownership, 'owner.json'), 'utf8')).output, path.join(parent, 'second'));
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports(); await rm(root, { recursive: true, force: true });
  }
});
