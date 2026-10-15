import { readFileSync } from 'node:fs';
import os from 'node:os';
import { isIP } from 'node:net';
import path from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { Type, type Static } from 'typebox';
import { Check } from 'typebox/value';
import { validateCredentialEnv } from './credentials.js';
export { readCredentialEnv, redactText } from './credentials.js';

const selector = Type.String({ minLength: 1, pattern: '^[^\\r\\n\\u0000]+$' });
/** Host prefixes only; these authorize IPs, not DNS names or destination ports. */
export function isCanonicalHostCidr(value: string): boolean {
  const [ip, prefix, extra] = value.split('/');
  if (extra !== undefined) return false;
  if (isIP(ip) === 4) return prefix === '32';
  if (isIP(ip) !== 6 || prefix !== '128' || ip.includes('%')) return false;
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  // Pinned internal/egresspolicy.ParseCIDR rejects mapped IPv6: the gateway
  // evaluates unmapped addresses, so these rules could never match.
  return !/^::ffff:[0-9a-f]+:[0-9a-f]+$/.test(canonical) && ip === canonical;
}

// Embedded refinements work with Pi's aliased TypeBox; no global format registry.
const absolutePath = Type.Refine(Type.String(), (value) => path.isAbsolute(value) && !/[\r\n\0]/.test(value));
const tlsAddress = Type.Refine(Type.String(), (value) => {
  const match = /^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):([0-9]{1,5})$/.exec(value);
  return !!match && Number(match[1]) >= 1 && Number(match[1]) <= 65535;
});
const tlsName = Type.Refine(Type.String(), (value) => value.length <= 253 && isIP(value) === 0 &&
  value.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)));

export const EgressConfigSchema = Type.Object({
  address: tlsAddress,
  serverName: tlsName,
  caFile: absolutePath,
  bearerTokenFile: absolutePath,
  cidrs: Type.Array(Type.Refine(Type.String(), isCanonicalHostCidr), { minItems: 1, maxItems: 256, uniqueItems: true }),
}, { additionalProperties: false });
export type EgressConfig = Static<typeof EgressConfigSchema>;

export function validateEgressConfig(value: unknown): EgressConfig {
  if (!Check(EgressConfigSchema, value)) throw new Error('Invalid egress configuration: explicit TLS endpoint, DNS identity, absolute CA/token file paths and canonical /32 or /128 CIDRs required; unknown fields are rejected');
  return { ...value, cidrs: [...value.cidrs] };
}

export const AxConfigSchema = Type.Object({
  controlAddress: selector,
  routerAddress: selector,
  atespace: selector,
  workerImage: selector,
  workerProvider: selector,
  workerModel: selector,
  credentialEnv: Type.Array(Type.String()),
  egress: Type.Optional(EgressConfigSchema),
}, { additionalProperties: false });
export type AxConfig = Static<typeof AxConfigSchema>;
export const AxFileConfigSchema = Type.Object({
  ...AxConfigSchema.properties,
  stateDir: Type.Optional(selector),
}, { additionalProperties: false });

export const DEFAULT_PROCESS_TIMEOUT_SECONDS = 900;
export const DEFAULT_MAX_ACTIVE_TASKS = 1;

export function validateLabel(value: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new Error('AX names and atespace must be RFC1123 labels (1–63 characters)');
  }
  return value;
}

/** Plaintext endpoints match pinned AX; URLs are rejected rather than silently downgrading TLS. */
export function validateAddress(value: string): string {
  const match = /^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):([0-9]{1,5})$/.exec(value);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) {
    throw new Error('AX addresses must be explicit host:port (plaintext, trusted local network only)');
  }
  return value;
}

/** Pi owns agent-directory defaults and PI_CODING_AGENT_DIR path expansion. */
export function getConfigPath(): string {
  return path.resolve(getAgentDir(), 'ax-config.json');
}

function readConfigFile(file: string, optional = false): Record<string, unknown> | undefined {
  let text: string;
  try { text = readFileSync(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (optional) return undefined;
      throw new Error(`Missing AX configuration: ${file}. Copy ax-config.example.json there and configure it explicitly.`);
    }
    throw new Error(`Cannot read AX configuration: ${file}. Check file permissions.`);
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error(`Invalid AX configuration: ${file}. Expected valid JSON; contents omitted.`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid AX configuration: ${file}. Expected a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function stateDirectory(value: unknown): string {
  if (value === undefined) return path.join(os.homedir(), '.pi-ax');
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\r\n\0]/.test(value)) {
    throw new Error('stateDir must be an absolute path');
  }
  return value;
}

/** Recovery needs only storage selection, not current spawn/model settings. */
export function loadStateDir(): string {
  const file = getConfigPath();
  const value = readConfigFile(file, true);
  try { return stateDirectory(value?.stateDir); }
  catch { throw new Error(`Invalid AX configuration: ${file}. stateDir must be an absolute path.`); }
}

/** Reads only ax-config.json, never credentials, host login files or legacy PI_AX settings. */
export function loadConfig(): AxConfig {
  const file = getConfigPath();
  const value = readConfigFile(file);
  if (!Check(AxFileConfigSchema, value)) {
    throw new Error(`Invalid AX configuration: ${file}. Required string fields: controlAddress, routerAddress, atespace, workerImage, workerProvider, workerModel; credentialEnv must be a string array. stateDir and egress are optional when loading; unknown keys and invalid egress fields are rejected.`);
  }
  try {
    for (const key of ['controlAddress', 'routerAddress', 'atespace', 'workerImage', 'workerProvider', 'workerModel'] as const) {
      if (!value[key].trim()) throw new Error(`${key} must not be blank`);
    }
    validateAddress(value.controlAddress);
    validateAddress(value.routerAddress);
    validateLabel(value.atespace);
    validateCredentialEnv(value.credentialEnv);
    stateDirectory(value.stateDir);
  } catch (error) {
    // Validation messages are static policy text, never values or raw parser errors.
    throw new Error(`Invalid AX configuration: ${file}. ${(error as Error).message}`);
  }
  // Keep storage selection out of persisted v1 task configuration.
  return {
    controlAddress: value.controlAddress, routerAddress: value.routerAddress, atespace: value.atespace,
    workerImage: value.workerImage, workerProvider: value.workerProvider, workerModel: value.workerModel,
    credentialEnv: value.credentialEnv,
    ...(value.egress === undefined ? {} : { egress: validateEgressConfig(value.egress) }),
  };
}
