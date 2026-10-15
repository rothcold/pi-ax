import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { createHash, X509Certificate } from 'node:crypto';
import { createSecureContext } from 'node:tls';
import * as grpc from '@grpc/grpc-js';
import { isCanonicalHostCidr, validateEgressConfig, validateLabel, type EgressConfig } from '../config.js';
import type { RpcOptions, TaskRef } from './client.js';
import { egressProtocol } from './egress-protocol.js';
import type { ControlClient } from './generated/ateapi/Control.js';
import type { EgressPolicy__Output } from './generated/ateapi/EgressPolicy.js';

type Operation = 'CreateActorEgressPolicy' | 'GetActorEgressPolicy' | 'egress preflight' | 'GetActor' | 'GetActorTemplate' | 'native evidence';

/** Never retains upstream details, metadata, responses, file errors or causes. */
export class EgressRpcError extends Error {
  readonly remoteStateUnknown = true;
  constructor(readonly operation: Operation, readonly code: grpc.status) {
    super(`${operation}: ${grpc.status[code] ?? 'UNKNOWN'}; remote state is not established by this error`);
    this.name = 'EgressRpcError';
  }
}

export interface ActorEgressPolicy {
  /** Bound to the validated request: upstream policy metadata does not repeat the actor name. */
  actor: TaskRef;
  name: 'default';
  uid: string;
  version: string;
  cidrs: string[];
}

function safeError(operation: Operation, error: unknown): EgressRpcError {
  if (error instanceof EgressRpcError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return new EgressRpcError(operation, Number.isInteger(code) && typeof code === 'number' && code >= 1 && code <= 16 ? code : grpc.status.UNKNOWN);
}

function readBoundedFile(file: string, maxBytes: number): Buffer {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) throw new Error('Invalid credential file');
    const buffer = Buffer.alloc(maxBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (count === 0) break;
      size += count;
    }
    if (size < 1 || size > maxBytes) throw new Error('Invalid credential file');
    return buffer.subarray(0, size);
  } finally { closeSync(fd); }
}

export interface NativeEvidenceScope {
  readonly version: 1;
  readonly address: string;
  readonly serverName: string;
  readonly caSha256: string;
}

function nativeTrust(config: EgressConfig) {
  const ca = readBoundedFile(config.caFile, 1024 * 1024).toString('utf8');
  const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!certificates?.length || ca.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g, '').trim()) {
    throw new Error('Invalid CA bundle');
  }
  for (const certificate of certificates) new X509Certificate(certificate);
  // Fingerprint the exact public PEM bytes supplied to TLS, never credentials or file paths.
  const scope: NativeEvidenceScope = Object.freeze({ version: 1, address: config.address, serverName: config.serverName,
    caSha256: createHash('sha256').update(ca).digest('hex') });
  return { ca, scope };
}

/** Public trust identity only; does not read the bearer file or connect. */
export function nativeEvidenceScope(config: EgressConfig): NativeEvidenceScope {
  try { return nativeTrust(validateEgressConfig(config)).scope; }
  catch { throw new EgressRpcError('native evidence', grpc.status.FAILED_PRECONDITION); }
}

function matchNativeScope(actual: NativeEvidenceScope, expected: unknown): void {
  if (typeof expected !== 'object' || expected === null || Object.keys(expected).length !== 4 ||
      !('version' in expected) || expected.version !== 1 ||
      !('address' in expected) || expected.address !== actual.address ||
      !('serverName' in expected) || expected.serverName !== actual.serverName ||
      !('caSha256' in expected) || expected.caSha256 !== actual.caSha256) {
    throw new EgressRpcError('native evidence', grpc.status.FAILED_PRECONDITION);
  }
}

/** Guard destructive AX cleanup against native scope retargeting before any delete request. */
export function requireNativeEvidenceScope(config: EgressConfig, expected: unknown): void {
  matchNativeScope(nativeEvidenceScope(config), expected);
}

function executionCredentials(config: EgressConfig) {
  const { ca, scope } = nativeTrust(config);
  const token = readBoundedFile(config.bearerTokenFile, 64 * 1024).toString('utf8').trim();
  if (!/^[A-Za-z0-9._~+/-]+=*$/.test(token)) throw new Error('Invalid bearer token file');
  const context = createSecureContext({ ca, minVersion: 'TLSv1.3' });
  return { credentials: grpc.credentials.createFromSecureContext(context), token, scope };
}

/** Execution-only preflight for new spawns. No RPC and no returned credential values. */
export function preflightEgress(config: EgressConfig): void {
  const validated = validateEgressConfig(config);
  try { executionCredentials(validated); }
  catch { throw new EgressRpcError('egress preflight', grpc.status.UNAUTHENTICATED); }
}

function validatePolicy(value: EgressPolicy__Output, actor: TaskRef, expectedCidrs?: string[]): ActorEgressPolicy {
  const metadata = value.metadata;
  const rule = value.rules?.[0];
  const cidrs = rule?.cidrs?.cidrs;
  if (!metadata || metadata.atespace !== actor.atespace || metadata.name !== 'default' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(metadata.uid) ||
    !/^[1-9][0-9]*$/.test(metadata.version) || BigInt(metadata.version) > 9223372036854775807n ||
    value.rules.length !== 1 || rule.hostnames != null || rule.all != null ||
    !cidrs || cidrs.length < 1 || cidrs.length > 256 || new Set(cidrs).size !== cidrs.length ||
    !cidrs.every(isCanonicalHostCidr) ||
    (expectedCidrs && (cidrs.length !== expectedCidrs.length || cidrs.some((cidr, i) => cidr !== expectedCidrs[i])))) {
    throw new Error('Invalid policy response');
  }
  return { actor: { ...actor }, name: 'default', uid: metadata.uid, version: metadata.version, cidrs: [...cidrs] };
}

/** Native policy Create/Get only. No retries, updates, deletes or lifecycle inference. */
export class EgressPolicyClient {
  readonly #config: EgressConfig;
  readonly #clients = new Set<ControlClient>();
  readonly #calls = new Set<grpc.ClientUnaryCall>();
  #closed = false;

  constructor(config: EgressConfig) { this.#config = validateEgressConfig(config); }

  close(): void {
    this.#closed = true;
    for (const call of this.#calls) call.cancel();
    this.#calls.clear();
    for (const client of this.#clients) client.close();
    this.#clients.clear();
  }

  createPolicy(actor: TaskRef, options: RpcOptions = {}): Promise<ActorEgressPolicy> {
    return this.request('CreateActorEgressPolicy', actor, options);
  }

  getPolicy(actor: TaskRef, options: RpcOptions = {}): Promise<ActorEgressPolicy> {
    return this.request('GetActorEgressPolicy', actor, options);
  }

  private async request(operation: 'CreateActorEgressPolicy' | 'GetActorEgressPolicy', ref: TaskRef, options: RpcOptions): Promise<ActorEgressPolicy> {
    const actor = { atespace: validateLabel(ref.atespace), name: validateLabel(ref.name) };
    const timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) throw new Error('RPC timeout must be 1–3600000 ms');
    if (this.#closed || options.signal?.aborted) throw new EgressRpcError(operation, grpc.status.CANCELLED);
    const deadline = Date.now() + timeoutMs;
    let client: ControlClient | undefined;
    try {
      // A fresh channel and token per explicit call; rotation is never an automatic retry.
      const { credentials, token } = executionCredentials(this.#config);
      const md = new grpc.Metadata();
      md.set('authorization', `Bearer ${token}`);
      client = new egressProtocol.ateapi.Control(this.#config.address, credentials, {
        'grpc.ssl_target_name_override': this.#config.serverName,
        'grpc.default_authority': this.#config.serverName,
        'grpc.enable_retries': 0,
        'grpc.max_receive_message_length': 1024 * 1024,
        'grpc.max_send_message_length': 1024 * 1024,
      });
      this.#clients.add(client);
      const response = await new Promise<EgressPolicy__Output>((resolve, reject) => {
        let cancel = () => {};
        const callback: grpc.requestCallback<EgressPolicy__Output> = (error, value) => {
          this.#calls.delete(call);
          options.signal?.removeEventListener('abort', cancel);
          if (error) reject(safeError(operation, error));
          else if (!value) reject(new EgressRpcError(operation, grpc.status.DATA_LOSS));
          else resolve(value);
        };
        const call = operation === 'CreateActorEgressPolicy'
          ? client!.CreateActorEgressPolicy({ actor, egressPolicy: {
            metadata: { atespace: actor.atespace, name: 'default' }, rules: [{ cidrs: { cidrs: this.#config.cidrs } }],
          } }, md, { deadline }, callback)
          : client!.GetActorEgressPolicy({ actor }, md, { deadline }, callback);
        this.#calls.add(call);
        cancel = () => call.cancel();
        options.signal?.addEventListener('abort', cancel, { once: true });
        if (options.signal?.aborted) cancel();
      });
      try { return validatePolicy(response, actor, operation === 'CreateActorEgressPolicy' ? this.#config.cidrs : undefined); }
      catch { throw new EgressRpcError(operation, grpc.status.DATA_LOSS); }
    } catch (error) { throw safeError(operation, error); }
    finally {
      if (client) { this.#clients.delete(client); client.close(); }
    }
  }
}

export interface NativeActorEvidence {
  ref: TaskRef; uid: string; template: TaskRef; state: string;
  templateUid: string; assignment: { worker: { atespace: ''; name: string } | null; pod: string; node: string } | null;
}
export interface NativeTemplateEvidence {
  ref: TaskRef; uid: string; images: string[]; sandboxClass: string;
  goldenSnapshotFailed: boolean;
}
export interface NativeEvidenceReader {
  getActor(ref: TaskRef): Promise<NativeActorEvidence>;
  getActorTemplate(ref: TaskRef): Promise<NativeTemplateEvidence>;
}

/** Harness-only readback. Authentication and raw responses never leave this boundary. */
export async function withNativeEvidence<T>(config: EgressConfig, work: (reader: NativeEvidenceReader) => Promise<T>, expectedScope: unknown): Promise<T> {
  let client: ControlClient | undefined;
  let closed = false;
  const checkedRef = (ref: TaskRef): TaskRef => ({ atespace: validateLabel(ref.atespace), name: validateLabel(ref.name) });
  // Pinned WorkerAssignment.worker is global; Actor/ActorTemplate refs remain namespaced.
  const checkedWorkerRef = (ref: TaskRef): { atespace: ''; name: string } => {
    if (ref.atespace !== '') throw new Error('Worker reference must be global');
    return { atespace: '', name: validateLabel(ref.name) };
  };
  const identity = (metadata: { atespace: string; name: string; uid: string } | null, ref: TaskRef): string => {
    if (!metadata || metadata.atespace !== ref.atespace || metadata.name !== ref.name ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(metadata.uid)) throw new Error('Invalid native identity');
    return metadata.uid;
  };
  try {
    const validated = validateEgressConfig(config);
    const { credentials, token, scope } = executionCredentials(validated);
    matchNativeScope(scope, expectedScope); // Bound to this channel's actual CA read, not an earlier preflight.
    const md = new grpc.Metadata(); md.set('authorization', `Bearer ${token}`);
    client = new egressProtocol.ateapi.Control(validated.address, credentials, {
      'grpc.ssl_target_name_override': validated.serverName, 'grpc.default_authority': validated.serverName,
      'grpc.enable_retries': 0, 'grpc.max_receive_message_length': 1024 * 1024,
    });
    const read = async <V>(operation: 'GetActor' | 'GetActorTemplate', call: (cb: grpc.requestCallback<V>) => void): Promise<V> => {
      if (closed) throw new EgressRpcError(operation, grpc.status.CANCELLED);
      try {
        return await new Promise<V>((resolve, reject) => call((error, value) => {
          if (error) reject(safeError(operation, error));
          else if (!value) reject(new EgressRpcError(operation, grpc.status.DATA_LOSS));
          else resolve(value);
        }));
      } catch (error) { throw safeError(operation, error); }
    };
    return await work({
      async getActor(input) {
        const ref = checkedRef(input);
        const actor = await read<import('./generated/ateapi/Actor.js').Actor__Output>('GetActor', (cb) =>
          client!.GetActor({ actor: ref }, md, { deadline: Date.now() + 15_000 }, cb));
        const uid = identity(actor.metadata, ref);
        if (!actor.actorTemplate || !actor.status) throw new EgressRpcError('GetActor', grpc.status.DATA_LOSS);
        const assignment = actor.status.workerAssignment;
        return { ref, uid, template: checkedRef(actor.actorTemplate), state: actor.status.state,
          templateUid: actor.status.currentActorTemplateUid,
          assignment: assignment ? { worker: assignment.worker ? checkedWorkerRef(assignment.worker) : null, pod: assignment.workerPod, node: assignment.nodeName } : null };
      },
      async getActorTemplate(input) {
        const ref = checkedRef(input);
        const template = await read<import('./generated/ateapi/ActorTemplate.js').ActorTemplate__Output>('GetActorTemplate', (cb) =>
          client!.GetActorTemplate({ actorTemplate: ref }, md, { deadline: Date.now() + 15_000 }, cb));
        return { ref, uid: identity(template.metadata, ref), images: template.containers.map((c) => c.image),
          sandboxClass: template.sandboxConfig?.sandboxClass ?? '', goldenSnapshotFailed: Boolean(template.status?.goldenSnapshotStatus?.errorMessage) };
      },
    });
  } catch (error) { throw safeError('native evidence', error); }
  finally { closed = true; client?.close(); }
}
