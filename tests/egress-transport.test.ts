import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { createSecureServer } from 'node:http2';
import path from 'node:path';
import test, { after, before } from 'node:test';
import * as grpc from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { EgressPolicyClient, EgressRpcError, preflightEgress, withNativeEvidence, nativeEvidenceScope } from '../src/ax/egress-client.js';
import type { EgressConfig } from '../src/config.js';
import type { ProtoGrpcType } from '../src/ax/generated/ateapi.js';
import type { EgressPolicy } from '../src/ax/generated/ateapi/EgressPolicy.js';
import type { ControlHandlers } from '../src/ax/generated/ateapi/Control.js';

// SAFETY: generated types match this exact vendored source and loader options.
// Load independently of the production loader.
const protocol = grpc.loadPackageDefinition(loadSync('proto/ateapi/ateapi.proto', {
  keepCase: false, longs: String, enums: String, defaults: true, oneofs: true,
})) as unknown as ProtoGrpcType;
const actor = { atespace: 'test-space', name: 'test-actor' };
const cidrs = ['192.0.2.97/32', '2001:db8::1/128'];
const token = 'test-only-sentinel-bearer-token';
const policy: EgressPolicy = {
  metadata: { atespace: actor.atespace, name: 'default', uid: '12345678-1234-1234-1234-123456789abc', version: '1' },
  rules: [{ cidrs: { cidrs } }],
};
let root: string;
let cert: Buffer;
let key: Buffer;
before(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'pi-ax-egress-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=api.ate-system.svc', '-addext', 'subjectAltName=DNS:api.ate-system.svc',
    '-keyout', path.join(root, 'key.pem'), '-out', path.join(root, 'ca.pem')], { stdio: 'ignore' });
  cert = readFileSync(path.join(root, 'ca.pem'));
  key = readFileSync(path.join(root, 'key.pem'));
});
after(() => rmSync(root, { recursive: true, force: true }));

async function fixture(handlers: Partial<ControlHandlers> & grpc.UntypedServiceImplementation) {
  const server = new grpc.Server();
  server.addService(protocol.ateapi.Control.service, handlers);
  const port = await new Promise<number>((resolve, reject) => server.bindAsync('127.0.0.1:0',
    grpc.ServerCredentials.createSsl(null, [{ private_key: key, cert_chain: cert }]),
    (error, port) => error ? reject(error) : resolve(port)));
  const tokenFile = path.join(root, `token-${port}`);
  const config: EgressConfig = {
    address: `127.0.0.1:${port}`, serverName: 'api.ate-system.svc',
    caFile: path.join(root, 'ca.pem'), bearerTokenFile: tokenFile, cidrs: [...cidrs],
  };
  const client = new EgressPolicyClient(config);
  // Constructor must neither read credentials nor connect; file is created afterwards.
  writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
  return { client, config, close() { client.close(); server.forceShutdown(); } };
}

test('EgressPolicyClient sends authenticated native Create/Get requests over CA-verified TLS with configured SNI', async () => {
  const calls: string[] = [];
  const f = await fixture({
    CreateActorEgressPolicy(call, cb) {
      calls.push('create');
      assert.deepEqual(call.metadata.get('authorization'), [`Bearer ${token}`]);
      assert.deepEqual(call.request.actor, actor);
      assert.equal(call.request.egressPolicy?.metadata?.atespace, actor.atespace);
      assert.equal(call.request.egressPolicy?.metadata?.name, 'default');
      assert.deepEqual(call.request.egressPolicy?.rules, [{ cidrs: { cidrs }, hostnames: null, all: null }]);
      cb(null, policy);
    },
    GetActorEgressPolicy(call, cb) {
      calls.push('get');
      assert.deepEqual(call.metadata.get('authorization'), [`Bearer ${token}`]);
      assert.deepEqual(call.request.actor, actor);
      cb(null, policy);
    },
  });
  try {
    assert.equal(protocol.ateapi.Control.service.CreateActorEgressPolicy.path, '/ateapi.Control/CreateActorEgressPolicy');
    const created = await f.client.createPolicy(actor);
    assert.deepEqual(created, { actor, name: 'default', uid: policy.metadata!.uid, version: '1', cidrs });
    assert.deepEqual(await f.client.getPolicy(actor), created);
    assert.deepEqual(calls, ['create', 'get']);
  } finally { f.close(); }
});

test('EgressPolicyClient accepts reordered CIDR set without mutating config or response arrays', async () => {
  const returnedCidrs = [...cidrs].reverse();
  const response = { ...policy, rules: [{ cidrs: { cidrs: returnedCidrs } }] };
  let calls = 0;
  const f = await fixture({ CreateActorEgressPolicy(call, cb) {
    calls++;
    assert.deepEqual(call.metadata.get('authorization'), [`Bearer ${token}`]);
    assert.deepEqual(call.request.egressPolicy?.rules?.[0].cidrs?.cidrs, cidrs);
    cb(null, response);
  } });
  const originalConfig = [...f.config.cidrs];
  const originalResponse = [...returnedCidrs];
  try {
    const created = await f.client.createPolicy(actor);
    assert.deepEqual(created.cidrs, originalResponse);
    assert.deepEqual(f.config.cidrs, originalConfig);
    assert.deepEqual(returnedCidrs, originalResponse);
    assert.equal(calls, 1);
  } finally { f.close(); }
});

function safeFailure(code: grpc.status) {
  return (error: unknown) => {
    assert.ok(error instanceof EgressRpcError);
    assert.equal(error.code, code);
    assert.equal(error.remoteStateUnknown, true);
    assert.equal('cause' in error, false);
    assert.equal('metadata' in error, false);
    assert.equal(`${String(error)} ${error.stack} ${JSON.stringify(error)}`.includes(token), false);
    return true;
  };
}

test('native failure codes propagate without server details, token, metadata or retries; Get never creates', async () => {
  for (const code of [grpc.status.NOT_FOUND, grpc.status.ALREADY_EXISTS, grpc.status.UNAUTHENTICATED,
    grpc.status.PERMISSION_DENIED, grpc.status.UNAVAILABLE, grpc.status.FAILED_PRECONDITION]) {
    let creates = 0, gets = 0;
    const metadata = new grpc.Metadata(); metadata.set('secret', token);
    const f = await fixture({
      CreateActorEgressPolicy(_call, cb) { creates++; cb({ code, message: token, details: token, metadata }); },
      GetActorEgressPolicy(_call, cb) { gets++; cb({ code, message: token, details: token, metadata }); },
    });
    try {
      await assert.rejects(f.client.getPolicy(actor), safeFailure(code));
      assert.equal(creates, 0);
      await assert.rejects(f.client.createPolicy(actor), safeFailure(code));
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.deepEqual([creates, gets], [1, 1]);
    } finally { f.close(); }
  }
});

test('wrong CA or DNS identity fails closed before bearer metadata reaches a handler', async () => {
  let calls = 0;
  const f = await fixture({ CreateActorEgressPolicy(_call, cb) { calls++; cb(null, policy); } });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=unrelated.test',
    '-keyout', path.join(root, 'other-key.pem'), '-out', path.join(root, 'other-ca.pem')], { stdio: 'ignore' });
  try {
    for (const override of [{ serverName: 'wrong.test' }, { caFile: path.join(root, 'other-ca.pem') }]) {
      const client = new EgressPolicyClient({ ...f.config, ...override });
      try { await assert.rejects(client.createPolicy(actor, { timeoutMs: 1000 }), safeFailure(grpc.status.UNAVAILABLE)); }
      finally { client.close(); }
    }
    assert.equal(calls, 0);
  } finally { f.close(); }
});

test('TLS below 1.3 is refused, never downgraded', async () => {
  let requests = 0;
  const server = createSecureServer({ key, cert, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' });
  server.on('stream', () => { requests++; });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const tokenFile = path.join(root, 'tls12-token'); writeFileSync(tokenFile, token, { mode: 0o600 });
  const client = new EgressPolicyClient({ address: `127.0.0.1:${address.port}`, serverName: 'api.ate-system.svc',
    caFile: path.join(root, 'ca.pem'), bearerTokenFile: tokenFile, cidrs });
  try {
    await assert.rejects(client.createPolicy(actor, { timeoutMs: 1000 }), safeFailure(grpc.status.UNAVAILABLE));
    assert.equal(requests, 0);
  } finally { client.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('credential preflight reads files only on execution, fails closed, and explicit calls reread rotated token', async () => {
  let calls = 0;
  const f = await fixture({ CreateActorEgressPolicy(call, cb) {
    calls++;
    if (call.metadata.get('authorization')[0] !== `Bearer ${token}`) cb({ code: grpc.status.UNAUTHENTICATED, details: token });
    else cb(null, policy);
  } });
  try {
    preflightEgress(f.config); assert.equal(calls, 0);
    for (const text of ['', ' \n', `Bearer ${token}`, token + '\nsecond-line']) {
      writeFileSync(f.config.bearerTokenFile, text);
      assert.throws(() => preflightEgress(f.config), safeFailure(grpc.status.UNAUTHENTICATED));
      await assert.rejects(f.client.createPolicy(actor));
      assert.equal(calls, 0);
    }
    writeFileSync(f.config.bearerTokenFile, 'expired-test-token');
    await assert.rejects(f.client.createPolicy(actor), safeFailure(grpc.status.UNAUTHENTICATED));
    writeFileSync(f.config.bearerTokenFile, token);
    await f.client.createPolicy(actor);
    rmSync(f.config.bearerTokenFile);
    await assert.rejects(f.client.createPolicy(actor));
    assert.equal(calls, 2, 'missing token must not reuse credentials cached from earlier calls');
    for (const text of ['', token, '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----']) {
      const caFile = path.join(root, 'invalid-ca.pem'); writeFileSync(caFile, text);
      assert.throws(() => preflightEgress({ ...f.config, caFile }), safeFailure(grpc.status.UNAUTHENTICATED));
    }
  } finally { f.close(); }
});

test('deadline, pre-abort, in-flight abort and close never replay an uncertain create', async () => {
  let calls = 0;
  let arrived: (() => void) | undefined;
  const f = await fixture({ CreateActorEgressPolicy() { calls++; arrived?.(); } });
  try {
    const aborted = AbortSignal.abort();
    await assert.rejects(f.client.createPolicy(actor, { signal: aborted }), safeFailure(grpc.status.CANCELLED));
    assert.equal(calls, 0);
    await assert.rejects(f.client.createPolicy(actor, { timeoutMs: 150 }), safeFailure(grpc.status.DEADLINE_EXCEEDED));
    assert.equal(calls, 1);
    const controller = new AbortController();
    const received = new Promise<void>((resolve) => { arrived = resolve; });
    const pending = f.client.createPolicy(actor, { signal: controller.signal });
    const rejected = assert.rejects(pending, safeFailure(grpc.status.CANCELLED));
    await received; controller.abort(); await rejected;
    const receivedAgain = new Promise<void>((resolve) => { arrived = resolve; });
    const closing = assert.rejects(f.client.createPolicy(actor), safeFailure(grpc.status.CANCELLED));
    await receivedAgain; f.client.close(); await closing;
    await assert.rejects(f.client.createPolicy(actor), safeFailure(grpc.status.CANCELLED));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(calls, 3);
  } finally { f.close(); }
});

test('policy response validation rejects wrong namespace/name, missing identity, unsafe rules and create mismatch', async () => {
  const malformed: EgressPolicy[] = [
    {}, { ...policy, metadata: { ...policy.metadata, atespace: 'wrong' } },
    { ...policy, metadata: { ...policy.metadata, name: 'wrong' } },
    { ...policy, metadata: { ...policy.metadata, uid: token } },
    { ...policy, metadata: { ...policy.metadata, version: '0' } },
    { ...policy, rules: [] }, { ...policy, rules: [{ all: {} }] },
    { ...policy, rules: [{ hostnames: { patterns: ['api.example.test'] } }] },
    ...[[], [cidrs[0], cidrs[0]], [...cidrs, cidrs[0]], ['192.0.2.97/032', cidrs[1]],
      [cidrs[0], '2001:DB8::1/128'], ['0.0.0.0/0'],
      Array.from({ length: 257 }, (_, i) => `2001:db8::${(i + 1).toString(16)}/128`)]
      .map((invalidCidrs) => ({ ...policy, rules: [{ cidrs: { cidrs: invalidCidrs } }] })),
    { ...policy, rules: [{ cidrs: { cidrs }, all: {} }] },
    { ...policy, rules: [{ cidrs: { cidrs } }, { cidrs: { cidrs } }] },
  ];
  let response = policy;
  const f = await fixture({
    CreateActorEgressPolicy(_call, cb) { cb(null, response); },
    GetActorEgressPolicy(_call, cb) { cb(null, response); },
  });
  try {
    for (response of malformed) {
      await assert.rejects(f.client.createPolicy(actor), safeFailure(grpc.status.DATA_LOSS));
      await assert.rejects(f.client.getPolicy(actor), safeFailure(grpc.status.DATA_LOSS));
    }
    for (const mismatchedCidrs of [[cidrs[0]], [...cidrs, '192.0.2.98/32'], ['192.0.2.98/32', cidrs[1]]]) {
      response = { ...policy, rules: [{ cidrs: { cidrs: mismatchedCidrs } }] };
      await assert.rejects(f.client.createPolicy(actor), safeFailure(grpc.status.DATA_LOSS));
      assert.deepEqual((await f.client.getPolicy(actor)).cidrs, mismatchedCidrs, 'Get exposes narrow existing rules for conflict inspection, not automatic replacement');
    }
  } finally { f.close(); }
});

test('preflight rejects non-regular credential files without blocking', async () => {
  const f = await fixture({});
  const fifo = path.join(root, 'credential-fifo');
  execFileSync('mkfifo', [fifo]);
  const script = `import { preflightEgress, EgressRpcError } from ${JSON.stringify(new URL('../src/ax/egress-client.ts', import.meta.url).href)};
    try { preflightEgress(${JSON.stringify({ ...f.config, bearerTokenFile: fifo })}); process.exit(2); }
    catch (error) { if (!(error instanceof EgressRpcError)) process.exit(3); }`;
  try {
    execFileSync(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', script], {
      timeout: 4000, killSignal: 'SIGKILL', stdio: 'pipe', env: { PATH: process.env.PATH, HOME: root, PI_CODING_AGENT_DIR: root, PI_OFFLINE: '1', PI_TELEMETRY: 'off' },
    });
  } finally { f.close(); }
});

test('native evidence reads bind TLS auth internally, omit env/errors, close and never retry', async () => {
  let calls = 0;
  const f = await fixture({
    GetActor(call, cb) {
      calls++; assert.deepEqual(call.metadata.get('authorization'), [`Bearer ${token}`]);
      cb(null, { metadata: { ...actor, uid: '12345678-1234-1234-1234-123456789abc', version: '1' }, actorTemplate: { atespace: actor.atespace, name: 'template' }, status: { state: 'ACTOR_STATE_RUNNING' } });
    },
    GetActorTemplate(call, cb) {
      calls++; assert.deepEqual(call.metadata.get('authorization'), [`Bearer ${token}`]);
      cb(null, { metadata: { ...call.request.actorTemplate, uid: '12345678-1234-1234-1234-123456789abc', version: '1' }, containers: [{ image: 'image@sha256:abc', env: [{ name: 'SECRET', value: token }] }], sandboxConfig: { sandboxClass: 'SANDBOX_CLASS_GVISOR' }, status: { goldenSnapshotStatus: { errorMessage: token } } });
    },
  });
  try {
    let escaped: Parameters<Parameters<typeof withNativeEvidence>[1]>[0] | undefined;
    const result = await withNativeEvidence(f.config, async (reader) => {
      escaped = reader;
      return { actor: await reader.getActor(actor), template: await reader.getActorTemplate({ atespace: actor.atespace, name: 'template' }) };
    }, nativeEvidenceScope(f.config));
    assert.equal(calls, 2); assert(!JSON.stringify(result).includes(token));
    assert.equal(result.template.goldenSnapshotFailed, true);
    await assert.rejects(escaped!.getActor(actor), safeFailure(grpc.status.CANCELLED));
    await assert.rejects(withNativeEvidence(f.config, async () => { throw new Error(token); }, nativeEvidenceScope(f.config)), safeFailure(grpc.status.UNKNOWN));
  } finally { f.close(); }
  const denied = await fixture({ GetActor(_call, cb) { calls++; cb({ code: grpc.status.PERMISSION_DENIED, details: token }); } });
  try { await assert.rejects(withNativeEvidence(denied.config, (r) => r.getActor(actor), nativeEvidenceScope(denied.config)), safeFailure(grpc.status.PERMISSION_DENIED)); assert.equal(calls, 3); }
  finally { denied.close(); }
});

test('E2E native evidence follows actor/template UID; all absent readback required and unrelated templates block', async () => {
  const { captureRuntime, confirmRuntimeAbsent } = await import('../scripts/e2e-native-evidence.js');
  const { AxTransport, AxRpcError } = await import('../src/ax/client.js');
  const uid = '12345678-1234-1234-1234-123456789abc';
  const templateRef = { atespace: actor.atespace, name: `${actor.name}-tmpl-12345678` };
  let taskAbsent = false, actorAbsent = false, templateAbsent = false, goldenAbsent = true, shared = false;
  const refs: unknown[] = [];
  const f = await fixture({
    GetActor(call, cb) {
      refs.push(call.request.actor);
      if (call.request.actor?.atespace === 'ate-golden' ? goldenAbsent : actorAbsent) { cb({ code: grpc.status.NOT_FOUND }); return; }
      cb(null, { metadata: { ...call.request.actor, uid, version: '1' }, actorTemplate: shared ? { ...templateRef, name: 'shared' } : templateRef,
        status: { state: 'ACTOR_STATE_RUNNING', currentActorTemplateUid: uid, workerAssignment: { worker: { atespace: '', name: uid }, workerPod: 'owned-pod', nodeName: 'node' } } });
    },
    GetActorTemplate(call, cb) {
      if (templateAbsent) { cb({ code: grpc.status.NOT_FOUND }); return; }
      cb(null, { metadata: { ...call.request.actorTemplate, uid, version: '1' }, containers: [{ image: 'fixture:image', env: [{ name: 'SECRET', value: token }] }], sandboxConfig: { sandboxClass: 'SANDBOX_CLASS_GVISOR' } });
    },
  });
  class Control extends AxTransport {
    override async getTask() {
      if (taskAbsent) throw new AxRpcError('GetTask', 5);
      return { apiVersion: 'ax.io/v1alpha1', kind: 'Task', metadata: { ...actor, creationTimestamp: null },
        spec: { image: 'fixture:image', command: [], env: [], resources: null, workspaces: [], debug: true },
        status: { actor: actor.name, phase: 'Running', id: '', workerIp: '', pendingApproval: null, usage: null, conditions: [] } };
    }
  }
  const config = { controlAddress: '127.0.0.1:1', routerAddress: '127.0.0.1:2', atespace: actor.atespace, workerImage: 'fixture:image', workerProvider: 'fixture', workerModel: 'fixture', credentialEnv: [], egress: f.config };
  const control = new Control(config);
  const saved: Record<string, unknown> = {};
  const save = async (name: string, value: unknown) => { saved[name] = value; };
  try {
    const evidence = await captureRuntime(config, control, actor, save, nativeEvidenceScope(f.config));
    assert.deepEqual(evidence.goldenRef, { atespace: 'ate-golden', name: uid });
    assert(refs.some((ref) => JSON.stringify(ref) === JSON.stringify(evidence.goldenRef)));
    assert(!JSON.stringify(saved).includes(token));
    await assert.rejects(confirmRuntimeAbsent(config, control, evidence, save, nativeEvidenceScope(f.config)));
    taskAbsent = true; await assert.rejects(confirmRuntimeAbsent(config, control, evidence, save, nativeEvidenceScope(f.config)));
    actorAbsent = true; await assert.rejects(confirmRuntimeAbsent(config, control, evidence, save, nativeEvidenceScope(f.config)));
    templateAbsent = true; goldenAbsent = false; await assert.rejects(confirmRuntimeAbsent(config, control, evidence, save, nativeEvidenceScope(f.config)));
    assert.equal((saved['absence.json'] as { allNotFound: boolean }).allNotFound, false);
    goldenAbsent = true; await confirmRuntimeAbsent(config, control, evidence, save, nativeEvidenceScope(f.config));
    const absence = saved['absence.json'] as { allNotFound: boolean; observations: { status: string }[] };
    assert.equal(absence.allNotFound, true); assert.equal(absence.observations.length, 4);
    assert(absence.observations.every((item) => item.status === 'not_found'));
    taskAbsent = actorAbsent = templateAbsent = false; shared = true;
    await assert.rejects(captureRuntime(config, control, actor, save, nativeEvidenceScope(f.config)));
  } finally { control.close(); f.close(); }
});

test('native cleanup scope cannot reconcile original leftovers through unrelated NotFound; rotations retain trust', async () => {
  const { createHash } = await import('node:crypto');
  const { mkdir, readFile, rm } = await import('node:fs/promises');
  const { runOwnedE2E } = await import('../scripts/e2e-lifecycle.js');
  const { reconcileE2E } = await import('../scripts/e2e.js');
  const { confirmRuntimeAbsent } = await import('../scripts/e2e-native-evidence.js');
  const { AxTransport, AxRpcError } = await import('../src/ax/client.js');
  const uid = '12345678-1234-1234-1234-123456789abc';
  const templateRef = { atespace: actor.atespace, name: `${actor.name}-tmpl-12345678` };
  let leftovers = true, originalReads = 0, unrelatedReads = 0;
  const auth: unknown[] = [];
  const original = await fixture({
    GetActor(call, cb) {
      originalReads++; auth.push(call.metadata.get('authorization'));
      if (call.request.actor?.atespace !== 'ate-golden' || !leftovers) { cb({ code: grpc.status.NOT_FOUND }); return; }
      cb(null, { metadata: { ...call.request.actor, uid }, actorTemplate: templateRef, status: { state: 'ACTOR_STATE_SUSPENDED' } });
    },
    GetActorTemplate(call, cb) {
      originalReads++; auth.push(call.metadata.get('authorization'));
      if (!leftovers) { cb({ code: grpc.status.NOT_FOUND }); return; }
      cb(null, { metadata: { ...templateRef, uid }, containers: [{ image: 'fixture:image' }], sandboxConfig: { sandboxClass: 'SANDBOX_CLASS_GVISOR' } });
    },
  });
  const unrelated = await fixture({
    GetActor(_call, cb) { unrelatedReads++; cb({ code: grpc.status.NOT_FOUND }); },
    GetActorTemplate(_call, cb) { unrelatedReads++; cb({ code: grpc.status.NOT_FOUND }); },
  });
  class DeletedTask extends AxTransport { override async getTask(): Promise<never> { throw new AxRpcError('GetTask', 5); } }
  const config = { controlAddress: '127.0.0.1:1', routerAddress: '127.0.0.1:2', atespace: actor.atespace, workerImage: 'fixture:image', workerProvider: 'fixture', workerModel: 'fixture', credentialEnv: [], egress: original.config };
  const control = new DeletedTask(config);
  const scope = { version: 1, address: original.config.address, serverName: original.config.serverName, caSha256: createHash('sha256').update(cert).digest('hex') };
  const evidence = { actor: { ref: actor, uid, template: templateRef, state: 'ACTOR_STATE_SUSPENDED', templateUid: uid, assignment: null }, template: { ref: templateRef, uid, images: ['fixture:image'], sandboxClass: 'SANDBOX_CLASS_GVISOR', goldenSnapshotFailed: false }, goldenRef: { atespace: 'ate-golden', name: uid }, golden: null };
  const directory = path.join(root, 'scope-recovery'); await mkdir(directory);
  const ownership = path.join(directory, 'ownership'); const output = path.join(directory, 'output');
  let deletes = 0;
  const confirm = (egress: EgressConfig, expected: unknown, save: (name: string, data: unknown) => Promise<void>) => confirmRuntimeAbsent({ ...config, egress }, control, evidence, save, expected);
  try {
    assert.deepEqual(nativeEvidenceScope({ ...original.config, bearerTokenFile: path.join(directory, 'absent-token') }), scope);
    await assert.rejects(runOwnedE2E({ root: ownership, output, mode: 'wire', identity: { nativeScope: scope, ref: actor, controlAddress: config.controlAddress, routerAddress: config.routerAddress },
      async execute(save) { await save('native-evidence.json', evidence); },
      async archive() { return { terminal: true, files: ['native-evidence.json'] }; },
      async destroy() { deletes++; }, async confirm(save) { await confirm(original.config, scope, save); },
    }));
    assert.equal(JSON.parse(await readFile(path.join(ownership, 'owner.json'), 'utf8')).stage, 'confirming');
    const preserved = await readFile(path.join(output, 'native-evidence.json'));
    const reconcile = async (egress: EgressConfig, expected: unknown = scope) => {
      const ownerFile = path.join(ownership, 'owner.json');
      const owner = JSON.parse(await readFile(ownerFile, 'utf8'));
      if (expected === null) delete owner.identity.nativeScope; else owner.identity.nativeScope = expected;
      writeFileSync(ownerFile, JSON.stringify(owner)); // Deliberate malformed/legacy-ledger fixtures only.
      await reconcileE2E({ ...config, egress }, ownership, control);
    };
    await assert.rejects(reconcile(unrelated.config), /unresolved/);
    assert.equal(unrelatedReads, 0, 'Wrong endpoint must be rejected before native reads');
    assert.equal(deletes, 1, 'Reconciliation never repeats delete');
    const readsBeforeMismatch = originalReads;
    const noSave = async () => {};
    await assert.rejects(confirm(unrelated.config, scope, noSave), safeFailure(grpc.status.FAILED_PRECONDITION)); // Normal confirmation also bound.
    await assert.rejects(confirm({ ...original.config, serverName: 'other.test' }, scope, noSave), safeFailure(grpc.status.FAILED_PRECONDITION));
    const changedTrust = path.join(directory, 'changed-ca.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=other.test', '-keyout', path.join(directory, 'other-key.pem'), '-out', changedTrust], { stdio: 'ignore' });
    // Still trusts the original TLS server, but silently expands trust: scope binding must reject it.
    writeFileSync(changedTrust, Buffer.concat([cert, readFileSync(changedTrust)]));
    await assert.rejects(confirm({ ...original.config, caFile: changedTrust }, scope, noSave), safeFailure(grpc.status.FAILED_PRECONDITION));
    await assert.rejects(reconcile({ ...original.config, caFile: changedTrust }));
    for (const malformed of [null, {}, { ...scope, caSha256: 'bad' }, { ...scope, version: 2 }]) await assert.rejects(reconcile(original.config, malformed));
    await assert.rejects(confirm(original.config, undefined, noSave)); // No current-config inference for legacy identity.
    assert.equal(originalReads, readsBeforeMismatch);
    assert.deepEqual(await readFile(path.join(output, 'native-evidence.json')), preserved);
    assert.equal(JSON.parse(await readFile(path.join(ownership, 'owner.json'), 'utf8')).stage, 'confirming');
    const movedCA = path.join(directory, 'moved-ca.pem'); const movedToken = path.join(directory, 'moved-token');
    writeFileSync(movedCA, cert); writeFileSync(movedToken, 'rotated-synthetic-token\n', { mode: 0o600 });
    const rotated = { ...original.config, caFile: movedCA, bearerTokenFile: movedToken };
    assert.deepEqual(nativeEvidenceScope(rotated), scope);
    // Correct scope still sees original leftovers after credential path relocation.
    await assert.rejects(reconcile(rotated));
    leftovers = false; // Test server only; no remote deletion API exists in this fixture.
    await confirm(rotated, scope, noSave);
    await reconcile(rotated);
    assert.equal(JSON.parse(await readFile(path.join(ownership, 'owner.json'), 'utf8')).stage, 'cleaned');
    assert(auth.some((value) => JSON.stringify(value) === JSON.stringify(['Bearer rotated-synthetic-token'])));
    const ledger = await readFile(path.join(ownership, 'owner.json'), 'utf8');
    assert(!ledger.includes('rotated-synthetic-token') && !ledger.includes(token) && !ledger.includes('BEGIN CERTIFICATE'));
    assert.equal(unrelatedReads, 0); assert.equal(deletes, 1);
  } finally { control.close(); original.close(); unrelated.close(); await rm(directory, { recursive: true, force: true }); }
});

test('native actor evidence accepts global Worker refs and preserves absent assignment/worker', async () => {
  const uid = '12345678-1234-1234-1234-123456789abc';
  const worker = { atespace: '', name: '22345678-1234-1234-1234-123456789abc' };
  const template = { atespace: actor.atespace, name: `${actor.name}-tmpl-12345678` };
  let assignment: import('../src/ax/generated/ateapi/WorkerAssignment.js').WorkerAssignment | null = {
    worker, workerPod: 'owned-pod', nodeName: 'node',
  };
  const f = await fixture({
    GetActor(call, cb) {
      assert.deepEqual(call.metadata.get('authorization'), [`Bearer ${token}`]);
      cb(null, { metadata: { ...actor, uid }, actorTemplate: template,
        status: { state: 'ACTOR_STATE_RUNNING', currentActorTemplateUid: uid, workerAssignment: assignment } });
    },
    GetActorTemplate(_call, cb) { cb(null, { metadata: { ...template, uid }, containers: [{ image: 'fixture:image' }], sandboxConfig: { sandboxClass: 'SANDBOX_CLASS_GVISOR' } }); },
  });
  try {
    await withNativeEvidence(f.config, async (reader) => {
      const evidence = await reader.getActor(actor);
      assert.deepEqual(evidence.assignment, { worker, pod: 'owned-pod', node: 'node' });
      assert.equal(evidence.templateUid, (await reader.getActorTemplate(evidence.template)).uid);
      assignment = null;
      assert.equal((await reader.getActor(actor)).assignment, null);
      assignment = { worker: null, workerPod: 'owned-pod', nodeName: 'node' };
      assert.deepEqual((await reader.getActor(actor)).assignment, { worker: null, pod: 'owned-pod', node: 'node' });
    }, nativeEvidenceScope(f.config));
  } finally { f.close(); }
});

test('native Worker scope/name rejects malformed refs without loosening Actor or ActorTemplate scope', async () => {
  const uid = '12345678-1234-1234-1234-123456789abc';
  const template = { atespace: actor.atespace, name: `${actor.name}-tmpl-12345678` };
  let worker = { atespace: '', name: uid };
  let templateScope = template.atespace, actorScope = actor.atespace;
  let calls = 0;
  const f = await fixture({
    GetActor(_call, cb) {
      calls++;
      cb(null, { metadata: { ...actor, atespace: actorScope, uid }, actorTemplate: { ...template, atespace: templateScope },
        status: { state: 'ACTOR_STATE_RUNNING', workerAssignment: { worker } } });
    },
    GetActorTemplate(_call, cb) { calls++; cb(null, { metadata: { ...template, atespace: templateScope, uid } }); },
  });
  const read = () => withNativeEvidence(f.config, (reader) => reader.getActor(actor), nativeEvidenceScope(f.config));
  try {
    for (const invalid of [{ atespace: 'workers', name: uid }, { atespace: ' ', name: uid },
      { atespace: '', name: '' }, { atespace: '', name: '../worker' }, { atespace: '', name: 'UPPER' }, { atespace: '', name: 'w'.repeat(64) }]) {
      worker = invalid;
      await assert.rejects(read(), safeFailure(grpc.status.UNKNOWN));
    }
    worker = { atespace: '', name: uid };
    templateScope = ''; await assert.rejects(read(), safeFailure(grpc.status.UNKNOWN));
    await assert.rejects(withNativeEvidence(f.config, (reader) => reader.getActorTemplate(template), nativeEvidenceScope(f.config)), safeFailure(grpc.status.UNKNOWN));
    templateScope = template.atespace; actorScope = '';
    await assert.rejects(read(), safeFailure(grpc.status.UNKNOWN));
    const beforeInvalidRequests = calls;
    await assert.rejects(withNativeEvidence(f.config, (reader) => reader.getActor({ ...actor, atespace: '' }), nativeEvidenceScope(f.config)), safeFailure(grpc.status.UNKNOWN));
    await assert.rejects(withNativeEvidence(f.config, (reader) => reader.getActorTemplate({ ...template, atespace: '' }), nativeEvidenceScope(f.config)), safeFailure(grpc.status.UNKNOWN));
    assert.equal(calls, beforeInvalidRequests, 'Invalid namespaced requests must fail before RPC');
  } finally { f.close(); }
});
