import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach } from 'node:test';
import { DEFAULT_MAX_ACTIVE_TASKS, DEFAULT_PROCESS_TIMEOUT_SECONDS, getConfigPath, loadConfig, loadStateDir, readCredentialEnv, redactText, validateAddress, validateLabel } from '../src/config.js';

const settings = {
  controlAddress: '127.0.0.1:8080', routerAddress: 'localhost:8081', atespace: 'test-space',
  workerImage: 'local/pi-worker@sha256:abc', workerProvider: 'anthropic', workerModel: 'explicit-model',
  credentialEnv: ['ANTHROPIC_API_KEY'],
};
let root: string;
let originalEnv: NodeJS.ProcessEnv;
let savedEnv: NodeJS.ProcessEnv;
beforeEach(() => {
  originalEnv = process.env;
  savedEnv = { ...process.env };
  root = mkdtempSync(path.join(os.tmpdir(), 'pi-ax-config-'));
  process.env.HOME = root;
  process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
  mkdirSync(process.env.PI_CODING_AGENT_DIR!);
});
afterEach(() => {
  process.env = originalEnv;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
  rmSync(root, { recursive: true, force: true });
});
function configure(value: unknown = settings): void { writeFileSync(getConfigPath(), JSON.stringify(value)); }

test('loadConfig reads explicit JSON settings but never credential values', () => {
  configure();
  process.env = { ...process.env };
  Object.defineProperty(process.env, 'ANTHROPIC_API_KEY', { get() { throw new Error('credential read too early'); } });
  const config = loadConfig();
  assert.equal(config.workerModel, 'explicit-model');
  assert.deepEqual(config.credentialEnv, ['ANTHROPIC_API_KEY']);
  assert.equal(JSON.stringify(config).includes('credential read too early'), false);
  assert.equal(DEFAULT_MAX_ACTIVE_TASKS, 1);
  assert.equal(DEFAULT_PROCESS_TIMEOUT_SECONDS, 900);
});

test('credentials are read only from allowlist on demand; absent credentials do not leak values', () => {
  configure();
  const config = loadConfig();
  const values = readCredentialEnv(config, { ANTHROPIC_API_KEY: 'sentinel-key', OTHER_SECRET: 'not-allowed' });
  assert.deepEqual(Object.keys(values), ['ANTHROPIC_API_KEY']);
  assert.equal(values.ANTHROPIC_API_KEY, 'sentinel-key');
  assert.throws(() => readCredentialEnv(config, {}), /Missing or invalid configured credential: ANTHROPIC_API_KEY/);
  assert.throws(() => readCredentialEnv(config, { ANTHROPIC_API_KEY: 'sentinel\0key' }), (error: Error) => !error.message.includes('sentinel'));
  assert.deepEqual(Object.keys(readCredentialEnv({ credentialEnv: [] }, {})), []);
});

test('explicit configuration rejects absent selectors, unsafe addresses/names and ambient execution variables', () => {
  for (const key of Object.keys(settings)) {
    const missing: Record<string, unknown> = { ...settings }; delete missing[key];
    configure(missing); assert.throws(() => loadConfig());
    configure({ ...settings, [key]: '' }); assert.throws(() => loadConfig());
  }
  for (const key of ['workerImage', 'workerProvider', 'workerModel']) {
    for (const value of [' ', 'bad\nvalue', 'bad\rvalue', 'bad\0value', 123]) {
      configure({ ...settings, [key]: value }); assert.throws(() => loadConfig());
    }
  }
  for (const name of ['Bad', '../escape', 'a'.repeat(64), '-bad', 'bad-']) {
    assert.throws(() => validateLabel(name));
    configure({ ...settings, atespace: name }); assert.throws(() => loadConfig());
  }
  for (const address of ['https://host:443', 'http://localhost:80', 'host', 'host:0', 'host:65536', 'user:pass@host:80', 'host:80/path']) {
    assert.throws(() => validateAddress(address));
    for (const key of ['controlAddress', 'routerAddress']) {
      configure({ ...settings, [key]: address }); assert.throws(() => loadConfig());
    }
  }
  assert.equal(validateAddress('[::1]:8080'), '[::1]:8080');
  for (const names of [['KEY', 'KEY'], ['bad name'], ['NODE_OPTIONS'], ['PATH'], ['HOME'], ['LD_PRELOAD'], ['PI_CODING_AGENT_DIR'], ['DYLD_INSERT_LIBRARIES'], ['BASH_ENV'], ['ENV'], ['XDG_CONFIG_HOME'], ['PI_AX_MODEL'], [42], 'KEY', null]) {
    configure({ ...settings, credentialEnv: names }); assert.throws(() => loadConfig());
  }
  configure({ ...settings, credentialEnv: [] }); assert.deepEqual(loadConfig().credentialEnv, []);
});

test('redactText replaces exact secrets including overlapping values and ignores empty strings', () => {
  assert.equal(redactText('abcdef abc abcdef', ['abc', '', 'abcdef']), '[REDACTED] [REDACTED] [REDACTED]');
});

test('Pi getAgentDir resolves clean default, absolute, relative, tilde and file URL overrides', () => {
  for (const [override, agent] of [
    [undefined, path.join(root, '.pi', 'agent')],
    [path.join(root, 'custom agent'), path.join(root, 'custom agent')],
    ['~/tilde-agent', path.join(root, 'tilde-agent')],
    ['~', root],
    ['./relative-agent', path.join(root, 'relative-agent')],
    [`file://${root}/url-agent`, path.join(root, 'url-agent')],
  ]) {
    mkdirSync(agent!, { recursive: true }); writeFileSync(path.join(agent!, 'ax-config.json'), JSON.stringify(settings));
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: root, PI_OFFLINE: '1', PI_TELEMETRY: 'off' };
    if (override !== undefined) env.PI_CODING_AGENT_DIR = override;
    const script = `import { getConfigPath, loadConfig } from ${JSON.stringify(new URL('../src/config.ts', import.meta.url).href)}; console.log(JSON.stringify({ file: getConfigPath(), config: loadConfig() }));`;
    const stdout = execFileSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', script], { cwd: root, env, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(stdout), { file: path.join(agent!, 'ax-config.json'), config: settings });
  }
});

test('missing, malformed, non-object and unknown-key configuration errors omit input values', () => {
  assert.throws(() => loadConfig(), (error: Error) => error.message.includes(getConfigPath()) && error.message.includes('ax-config.example.json'));
  const secret = 'RAW_SECRET_SENTINEL';
  for (const raw of [`{"${secret}":`, 'null', '[]', 'false', '42', JSON.stringify(secret), JSON.stringify({ ...settings, [secret]: secret }), JSON.stringify({ ...settings, workerModel: { secret } }), JSON.stringify({ ...settings, atespace: secret }), JSON.stringify({ ...settings, credentialEnv: [secret.toLowerCase()] })]) {
    writeFileSync(getConfigPath(), raw);
    assert.throws(() => loadConfig(), (error: Error) => error.message.includes(getConfigPath()) && !error.message.includes(secret) && !error.message.includes(secret.toLowerCase()));
  }
  rmSync(getConfigPath()); mkdirSync(getConfigPath());
  assert.throws(() => loadConfig(), /Cannot read AX configuration/);
});

test('stale PI_AX runtime environment cannot override or replace JSON configuration', () => {
  for (const key of ['ADDRESS', 'ROUTER_ADDRESS', 'ATESPACE', 'WORKER_IMAGE', 'PROVIDER', 'MODEL', 'CREDENTIAL_ENV', 'STATE_DIR']) process.env[`PI_AX_${key}`] = 'stale-env-value';
  configure(); assert.deepEqual(loadConfig(), settings);
  assert.equal(loadStateDir(), path.join(root, '.pi-ax'));
  rmSync(getConfigPath()); assert.throws(() => loadConfig(), /Missing AX configuration/);
});

test('stateDir defaults stay outside agent configuration and recovery ignores unrelated spawn settings', () => {
  assert.equal(loadStateDir(), path.join(root, '.pi-ax'));
  configure(); assert.equal(loadStateDir(), path.join(root, '.pi-ax'));
  const stateDir = path.join(root, 'retained-state');
  configure({ ...settings, stateDir }); assert.equal(loadStateDir(), stateDir);
  assert.deepEqual(loadConfig(), settings, 'stateDir must not change persisted AxConfig shape');
  configure({ stateDir, workerModel: null }); assert.equal(loadStateDir(), stateDir);
  assert.throws(() => loadConfig());
  for (const invalid of ['relative', '~/state', '', null, 12, '/bad\0path']) {
    configure({ ...settings, stateDir: invalid }); assert.throws(() => loadStateDir(), /stateDir/); assert.throws(() => loadConfig());
  }
});

test('shipped example is valid non-secret configuration', () => {
  const example = JSON.parse(readFileSync('ax-config.example.json', 'utf8'));
  configure(example); assert.deepEqual(loadConfig(), example);
});

test('explicit egress configuration is lazy, narrow and rejects unknown or unsafe fields', () => {
  const egress = {
    address: '127.0.0.1:18443', serverName: 'api.ate-system.svc',
    caFile: '/nonexistent/ca.pem', bearerTokenFile: '/nonexistent/token',
    cidrs: ['192.0.2.97/32', '2001:db8::1/128', '2001:db8:0:1:1:1:1:1/128'],
  };
  configure({ ...settings, egress });
  assert.deepEqual(loadConfig(), { ...settings, egress }, 'configuration must not read credential files');
  for (const key of Object.keys(egress)) {
    const missing: Record<string, unknown> = { ...egress }; delete missing[key];
    configure({ ...settings, egress: missing }); assert.throws(() => loadConfig());
  }
  for (const invalid of [
    { token: 'SENTINEL_SECRET' }, { all: {} }, { caFile: 'relative' }, { bearerTokenFile: '~/token' },
    { address: 'https://localhost:443' }, { address: 'localhost:0' }, { address: 'localhost:65536' },
    { serverName: '127.0.0.1' }, { serverName: '*.example.test' }, { serverName: 'bad\nname' },
    { cidrs: [] }, { cidrs: Array.from({ length: 257 }, () => '192.0.2.1/32') },
    ...['all', '0.0.0.0/0', '192.0.2.0/24', '::/0', '2001:db8::/64', '192.0.2.999/32',
      '192.000.2.1/32', '2001:DB8::1/128', '2001:0db8::1/128', 'fe80::1%lo/128', '192.0.2.1',
      '::ffff:192.0.2.1/128', '::ffff:c000:201/128', '2001:db8::1:1:1:1:1/128',
    ].map((cidr) => ({ cidrs: [cidr] })),
    { cidrs: ['192.0.2.1/32', '192.0.2.1/32'] },
  ]) {
    configure({ ...settings, egress: { ...egress, ...invalid } });
    assert.throws(() => loadConfig(), (error: Error) => !error.message.includes('SENTINEL_SECRET'));
  }
});
