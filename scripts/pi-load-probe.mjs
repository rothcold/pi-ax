// Runs in a clean child HOME/environment. Uses the installed Pi loader, no model/session.
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const piEntry = import.meta.resolve('@earendil-works/pi-coding-agent');
const { loadExtensions } = await import(new URL('./core/extensions/loader.js', piEntry));
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const loaded = await loadExtensions(manifest.pi.extensions.map((entry) => path.join(root, entry)), process.cwd());
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
assert.deepEqual([...loaded.extensions[0].tools.keys()].sort(), ['ax_cancel', 'ax_destroy', 'ax_result', 'ax_spawn', 'ax_status']);
// Jiti must have located the vendored protobufs relative to the extracted package.
assert.equal((await import(pathToFileURL(path.join(root, 'package.json')), { with: { type: 'json' } })).default.name, 'pi-ax');
// Exercise the same Jiti aliases, not a separate Node import of root TypeBox.
const probe = path.join(root, '.egress-schema-probe.ts');
await writeFile(probe, `
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Check } from 'typebox/value';
import { Type } from 'typebox';
import { EgressConfigSchema, loadConfig, getConfigPath, validateEgressConfig } from './src/config.ts';
import { TaskRecordSchema } from './src/task-schema.ts';
export default function () {
  const settings = { controlAddress:'localhost:1', routerAddress:'localhost:2', atespace:'test', workerImage:'test', workerProvider:'test', workerModel:'test', credentialEnv:[] };
  const egress = { address:'127.0.0.1:443', serverName:'api.ate-system.svc', caFile:'/nonexistent/ca', bearerTokenFile:'/nonexistent/token', cidrs:['192.0.2.97/32','2001:db8::1/128'] };
  const recordConfig = Type.Pick(TaskRecordSchema, ['config']);
  assert(Check(recordConfig, {config:settings}));
  assert(Check(recordConfig, {config:{...settings,egress}}));
  assert.deepEqual(validateEgressConfig(egress), egress);
  mkdirSync(path.dirname(getConfigPath()), {recursive:true});
  writeFileSync(getConfigPath(), JSON.stringify({...settings,egress}));
  assert.deepEqual(loadConfig().egress, egress); // nonexistent files prove cold/lazy validation
  for (const invalid of [
    {cidrs:['0.0.0.0/0']}, {cidrs:['192.0.2.0/24']}, {cidrs:['2001:DB8::1/128']},
    {cidrs:['::ffff:c000:201/128']}, {cidrs:['not-an-ip/32']}, {cidrs:[]},
    {cidrs:['192.0.2.97/32','192.0.2.97/32']}, {caFile:'relative'},
    {bearerTokenFile:'~/token'}, {address:'localhost:65536'}, {address:'https://localhost:443'},
    {serverName:'127.0.0.1'}, {serverName:'*.test'}, {token:'synthetic-secret'}
  ]) {
    const bad = {...egress,...invalid};
    assert.equal(Check(EgressConfigSchema,bad),false);
    assert.equal(Check(recordConfig,{config:{...settings,egress:bad}}),false);
    assert.throws(()=>validateEgressConfig(bad));
    writeFileSync(getConfigPath(), JSON.stringify({...settings,egress:bad}));
    assert.throws(()=>loadConfig());
  }
}
`);
try {
  const checked = await loadExtensions([probe], process.cwd());
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.extensions.length, 1);
} finally { await rm(probe); }
console.log('Actual Pi loader: five tools registered; valid/invalid egress and persisted-config schemas checked; no model/session started.');
