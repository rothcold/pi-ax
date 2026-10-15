import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { preflightEgress } from '../src/ax/egress-client.js';
import { validateEgressConfig } from '../src/config.js';

// Explicit, opt-in local-cluster identity bootstrap. No personal config is read or edited.
process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, '.cache/pi-ax');
const [context, ...cidrs] = process.argv.slice(2);
let forward: ChildProcess | undefined;
let evidence: string | undefined;
try {
  if (!/^kind-pi-ax-[0-9]{14}-[a-f0-9]{6}$/.test(context ?? '')) throw new Error('Explicit project kind context required');
  const base = { address: '127.0.0.1:1', serverName: 'api.ate-system.svc', caFile: '/pending/ca', bearerTokenFile: '/pending/token', cidrs };
  validateEgressConfig(base);
  const parent = path.join(root, '.cache/egress-policy-fix');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  evidence = mkdtempSync(path.join(parent, 'bootstrap-'));
  const home = path.join(evidence, 'home'); mkdirSync(home, { mode: 0o700 });
  const env = { PATH: '/usr/bin:/bin', HOME: home };
  const kubectl = path.join(cache, 'tools/kubectl');
  const args = ['--kubeconfig', path.join(cache, 'kubeconfig'), '--context', context, '--request-timeout=30s'];
  function query(extra: string[]): string {
    const result = spawnSync(kubectl, [...args, ...extra], { env, encoding: 'utf8', timeout: 35_000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error('Local Kubernetes query failed; no fallback');
    return result.stdout;
  }
  query(['-n', 'ate-system', 'get', 'serviceaccount', 'ate-client', '-o', 'name']);
  const bundles = JSON.parse(query(['get', 'clustertrustbundles', '-l', 'podcert.ate.dev/canarying=live', '-o', 'json'])) as { items: { spec: { signerName: string; trustBundle: string } }[] };
  const ca = bundles.items.filter((b) => b.spec.signerName === 'servicedns.podcert.ate.dev/identity').map((b) => b.spec.trustBundle).join('\n');
  if (!ca) throw new Error('No live service DNS trust bundle; no fallback');
  const caFile = path.join(evidence, 'ca.pem'); writeFileSync(caFile, ca, { mode: 0o600 });
  const bearerTokenFile = path.join(evidence, 'token');
  const fd = openSync(bearerTokenFile, 'wx', 0o600);
  try {
    // stdout goes directly to a private file: never capture or print a bearer token.
    const result = spawnSync(kubectl, [...args, '-n', 'ate-system', 'create', 'token', 'ate-client', '--audience=api.ate-system.svc', '--duration=1h'], { env, stdio: ['ignore', fd, 'ignore'], timeout: 35_000 });
    if (result.error || result.status !== 0) throw new Error('TokenRequest failed; no fallback');
  } finally { closeSync(fd); }
  preflightEgress({ ...base, caFile, bearerTokenFile });
  const log = path.join(evidence, 'port-forward.log');
  const logFd = openSync(log, 'wx', 0o600);
  try {
    forward = spawn(kubectl, [...args, '-n', 'ate-system', 'port-forward', '--address', '127.0.0.1', 'svc/api', ':443'], { env, detached: true, stdio: ['ignore', logFd, logFd] });
  } finally { closeSync(logFd); }
  let launchError = false; forward.on('error', () => { launchError = true; });
  writeFileSync(path.join(evidence, 'port-forward-owner.json'), JSON.stringify({ pid: forward.pid, context, kubeconfig: path.join(cache, 'kubeconfig'), service: 'ate-system/api', address: '127.0.0.1', startedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  let port: string | undefined;
  for (let i = 0; i < 100; i++) {
    if (launchError || forward.exitCode !== null || forward.signalCode !== null) throw new Error('Port-forward failed; no fallback');
    port = /Forwarding from 127\.0\.0\.1:([0-9]+) ->/.exec(readFileSync(log, 'utf8'))?.[1];
    if (port) break;
    await delay(100);
  }
  if (!port) throw new Error('Port-forward readiness deadline');
  const egress = validateEgressConfig({ ...base, address: `127.0.0.1:${port}`, caFile, bearerTokenFile });
  writeFileSync(path.join(evidence, 'egress-config.json'), JSON.stringify({ egress }, null, 2) + '\n', { mode: 0o600 });
  writeFileSync(path.join(evidence, 'bootstrap.json'), JSON.stringify({ context, identity: 'ate-system/ate-client', audience: 'api.ate-system.svc', requestedDuration: '1h', createdAt: new Date().toISOString(), policyModified: false }, null, 2), { mode: 0o600 });
  forward.unref();
  console.log(`Private bootstrap: ${evidence}\nNon-secret config fragment: ${path.join(evidence, 'egress-config.json')}\nToken expires: explicitly bootstrap again to refresh. Stop only the recorded owned port-forward when finished.`);
} catch {
  forward?.kill('SIGTERM');
  console.error('Egress bootstrap failed; no fallback, policy mutation or personal configuration edit. Inspect private evidence if created.');
  process.exitCode = 1;
}
