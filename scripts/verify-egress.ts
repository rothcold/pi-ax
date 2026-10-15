import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { AxTransport } from '../src/ax/client.js';
import { EgressPolicyClient, EgressRpcError, preflightEgress } from '../src/ax/egress-client.js';
import { validateAddress, validateEgressConfig, validateLabel } from '../src/config.js';

// Operator-authorized existing-actor diagnostic, not a task/model runner.
process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [fragment, actorName, routerAddress, target, evidence, createConsent] = process.argv.slice(2);
let policy: EgressPolicyClient | undefined;
let guest: AxTransport | undefined;
let stage = 'validation';
let writable = false;
function save(name: string, value: unknown): void {
  writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
try {
  if (!fragment || !path.isAbsolute(fragment) || !evidence || !path.isAbsolute(evidence) || createConsent !== '--create-if-absent') throw new Error('Explicit arguments required');
  const [atespace, name, extra] = actorName.split('/');
  if (extra !== undefined) throw new Error('Invalid actor');
  const actor = { atespace: validateLabel(atespace), name: validateLabel(name) };
  validateAddress(routerAddress);
  const url = new URL(target);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error('HTTPS without credentials/query required');
  const egress = validateEgressConfig(JSON.parse(readFileSync(fragment, 'utf8')).egress);
  preflightEgress(egress);
  const bootstrap = JSON.parse(readFileSync(path.join(path.dirname(fragment), 'bootstrap.json'), 'utf8')) as { context: string };
  if (!/^kind-pi-ax-[0-9]{14}-[a-f0-9]{6}$/.test(bootstrap.context)) throw new Error('Explicit project context required');
  mkdirSync(evidence, { mode: 0o700 }); writable = true;
  save('intent.json', { actor, cidrs: egress.cidrs, target, method: 'HEAD', env: {}, context: bootstrap.context, createdAt: new Date().toISOString(), noTaskCreate: true, noModelRequest: true });
  stage = 'gateway-check';
  const inspected = spawnSync(path.join(root, '.cache/pi-ax/tools/kubectl'), ['--kubeconfig', path.join(root, '.cache/pi-ax/kubeconfig'), '--context', bootstrap.context, '--request-timeout=30s', '-n', 'ate-system', 'get', 'deployment', 'ate-api-server', '-o', 'json'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: path.join(path.dirname(fragment), 'home') }, timeout: 35_000, maxBuffer: 4 * 1024 * 1024 });
  if (inspected.error || inspected.status !== 0) throw new Error('Gateway inspection failed');
  const deployment = JSON.parse(inspected.stdout);
  const gatewayArgs = (deployment.spec.template.spec.containers as { name: string; args?: string[] }[])
    .filter((c) => c.name === 'ate-api-server').flatMap((c) => c.args ?? []).filter((arg) => arg.startsWith('--egress-gateway-address='));
  if (gatewayArgs.length !== 1 || gatewayArgs[0] !== '--egress-gateway-address=atenet-egress.ate-system.svc:443') throw new Error('Expected enabled gateway not confirmed');
  save('gateway.json', { deployment: 'ate-system/ate-api-server', gatewayArgs, generation: deployment.metadata.generation, readyReplicas: deployment.status.readyReplicas });
  policy = new EgressPolicyClient(egress);
  stage = 'policy-get-before';
  let existing;
  try { existing = await policy.getPolicy(actor); save('policy-before.json', existing); }
  catch (error) {
    if (!(error instanceof EgressRpcError) || error.code !== 5) throw error;
    save('policy-before.json', { notFound: true });
  }
  if (existing && JSON.stringify(existing.cidrs) !== JSON.stringify(egress.cidrs)) throw new Error('Existing policy conflicts; never replace');
  if (!existing) {
    stage = 'policy-create-requested'; save('policy-create-intent.json', { actor, cidrs: egress.cidrs });
    // One attempt only. An uncertain reply leaves intent; operator may GET, never blindly retry.
    const created = await policy.createPolicy(actor); save('policy-created.json', created);
  }
  stage = 'policy-get-after';
  const verified = await policy.getPolicy(actor);
  if (JSON.stringify(verified.cidrs) !== JSON.stringify(egress.cidrs)) throw new Error('Policy readback mismatch');
  save('policy-verified.json', verified);
  guest = new AxTransport({ controlAddress: routerAddress, routerAddress });
  const program = `const https = require('node:https');
const req = https.request(${JSON.stringify(target)}, {method:'HEAD', rejectUnauthorized:true}, res => {
  const result = {tlsAuthorized:res.socket.authorized === true, tlsProtocol:res.socket.getProtocol(), httpStatus:res.statusCode, method:'HEAD', redirectsFollowed:0};
  console.log(JSON.stringify(result)); res.resume(); process.exitCode = result.tlsAuthorized && result.httpStatus >= 100 && result.httpStatus <= 599 ? 0 : 1;
});
req.setTimeout(15000, () => req.destroy(new Error('deadline')));
req.on('error', () => { console.log(JSON.stringify({connectivity:false})); process.exitCode=1; }); req.end();`;
  stage = 'probe-start-requested'; save('probe-start-intent.json', { actor, command: ['node', '-e', program], env: {}, timeoutSeconds: 25 });
  const started = await guest.startProcess(actor, { command: ['node', '-e', program], cwd: '/workspace', env: {}, timeoutSeconds: 25 });
  save('probe-started.json', started);
  stage = 'probe-wait';
  let observed = started;
  for (let i = 0; i < 70 && observed.state !== 'PROCESS_STATE_EXITED'; i++) {
    await delay(500); observed = await guest.getProcess(actor, started.processId);
  }
  save('probe-exit.json', observed);
  let stdout = ''; let stderrBytes = 0;
  for await (const output of guest.streamProcessOutput(actor, started.processId, { follow: false, maxBytes: 16384, timeoutMs: 5000 })) {
    stdout += output.stdout?.toString() ?? ''; stderrBytes += output.stderr?.length ?? 0;
  }
  const response = JSON.parse(stdout.trim()) as { tlsAuthorized: boolean; httpStatus: number };
  save('probe-response.json', { ...response, stderrBytes });
  if (observed.state !== 'PROCESS_STATE_EXITED' || observed.exitCode !== 0 || !response.tlsAuthorized || response.httpStatus < 100 || response.httpStatus > 599) throw new Error('No verified TLS/HTTP response');
  save('summary.json', { passed: true, connectivityOnly: true, modelAuthenticationTested: false, sqliteTested: false, actorRetained: true });
  console.log(`TLS/HTTP connectivity only verified; evidence: ${evidence}`);
} catch (error) {
  if (writable) save('failure.json', { stage, code: error instanceof EgressRpcError ? error.code : undefined, unknownRemoteState: true, noRetry: true });
  console.error('Egress verification stopped; no retry, fallback, policy replacement or task deletion. Inspect private stage evidence.');
  process.exitCode = 1;
} finally { policy?.close(); guest?.close(); }
