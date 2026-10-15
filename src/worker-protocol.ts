import path from 'node:path';
import { validateCredentialEnv } from './credentials.js';

export const WORKER_COMMAND = ['node', '/opt/pi-ax/dist/worker/run.js'];
export const MAX_REQUEST_BYTES = 1024 * 1024;
export const MAX_RESULT_BYTES = 1024 * 1024;
export const MAX_LOG_BYTES = 4 * 1024 * 1024;
export const MAX_PATCH_BYTES = 64 * 1024 * 1024;
export const ARTIFACT_NAMES = ['changes.patch', 'events.jsonl', 'stderr.log'] as const;
export type ArtifactName = typeof ARTIFACT_NAMES[number];
export interface WorkerRequest {
  version: 1; taskId: string; prompt: string; provider: string; model: string;
  credentialEnv: string[]; snapshotSha256: string;
}
export interface WorkerStarted { version: 1; taskId: string; snapshotSha256: string; startedAt: string }
export interface WorkerArtifact { name: ArtifactName; bytes: number; sha256: string }
/** Written only after the worker's subreaper has reaped all owned descendants. */
export interface WorkerTermination {
  version: 1; taskId: string; snapshotSha256: string; finishedAt: string;
  piExitCode: number | null; piSignal: number | null; interrupted: boolean;
}
export function parseWorkerTermination(data: Uint8Array): WorkerTermination {
  if (data.byteLength > 4096) throw new Error('Termination evidence exceeds limit');
  const v = JSON.parse(Buffer.from(data).toString('utf8')) as WorkerTermination;
  if (!v || v.version !== 1 || typeof v.taskId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(v.taskId)
    || typeof v.snapshotSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.snapshotSha256)
    || typeof v.finishedAt !== 'string' || !Number.isFinite(Date.parse(v.finishedAt))
    || typeof v.interrupted !== 'boolean'
    || (v.piExitCode !== null && (!Number.isInteger(v.piExitCode) || v.piExitCode < 0 || v.piExitCode > 255))
    || (v.piSignal !== null && (!Number.isInteger(v.piSignal) || v.piSignal < 1 || v.piSignal > 64))
    || (v.piExitCode !== null && v.piSignal !== null)) throw new Error('Invalid termination evidence');
  return v;
}
export interface WorkerResult extends WorkerStarted {
  finishedAt: string;
  outcome: 'completed' | 'failed' | 'incomplete';
  piExitCode: number | null; piSignal: string | null;
  agentSettled: boolean; finalStopReason: string | null; finalText: string;
  logsTruncated: boolean; patchComplete: boolean;
  issues: string[]; artifacts: WorkerArtifact[];
}
export function workerPaths(root = '/workspace') {
  const artifacts = path.join(root, '.pi-ax');
  return {
    request: path.join(root, 'pi-ax-request.json'), snapshot: path.join(root, 'pi-ax-snapshot.json'),
    repository: path.join(root, 'repo'), artifacts,
    started: path.join(artifacts, 'started.json'), result: path.join(artifacts, 'result.json'),
    termination: path.join(artifacts, 'termination.json'),
    patch: path.join(artifacts, 'changes.patch'), events: path.join(artifacts, 'events.jsonl'), stderr: path.join(artifacts, 'stderr.log'),
  };
}
export function parseWorkerRequest(data: Uint8Array): WorkerRequest {
  if (data.byteLength > MAX_REQUEST_BYTES) throw new Error('Worker request limit exceeded');
  const value: unknown = JSON.parse(Buffer.from(data).toString('utf8'));
  if (!value || typeof value !== 'object') throw new Error('Invalid worker request');
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || typeof v.taskId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(v.taskId)
    || typeof v.prompt !== 'string' || !v.prompt.trim() || Buffer.byteLength(v.prompt) > 256 * 1024
    || typeof v.provider !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(v.provider)
    || typeof v.model !== 'string' || !v.model.trim() || v.model.startsWith('-') || /[\x00-\x1f\x7f]/.test(v.model) || v.model.length > 256
    || typeof v.snapshotSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.snapshotSha256)
    || !Array.isArray(v.credentialEnv) || !v.credentialEnv.every((n) => typeof n === 'string')) throw new Error('Invalid worker request');
  // Reuse host allowlist policy without reading any credential values.
  validateCredentialEnv(v.credentialEnv);
  return { version: 1, taskId: v.taskId, prompt: v.prompt, provider: v.provider, model: v.model, credentialEnv: v.credentialEnv, snapshotSha256: v.snapshotSha256 };
}
export function parseWorkerResult(data: Uint8Array): WorkerResult {
  if (data.byteLength > MAX_RESULT_BYTES) throw new Error('Worker result limit exceeded');
  const v = JSON.parse(Buffer.from(data).toString('utf8')) as WorkerResult;
  if (!v || v.version !== 1 || typeof v.taskId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(v.taskId)
    || !/^[a-f0-9]{64}$/.test(v.snapshotSha256) || !['completed', 'failed', 'incomplete'].includes(v.outcome)
    || typeof v.startedAt !== 'string' || !Number.isFinite(Date.parse(v.startedAt)) || typeof v.finishedAt !== 'string' || !Number.isFinite(Date.parse(v.finishedAt))
    || (v.piExitCode !== null && (!Number.isInteger(v.piExitCode) || v.piExitCode < 0))
    || (v.piSignal !== null && typeof v.piSignal !== 'string') || typeof v.agentSettled !== 'boolean'
    || (v.finalStopReason !== null && typeof v.finalStopReason !== 'string') || typeof v.finalText !== 'string'
    || typeof v.logsTruncated !== 'boolean' || typeof v.patchComplete !== 'boolean'
    || !Array.isArray(v.issues) || !v.issues.every((s) => typeof s === 'string') || !Array.isArray(v.artifacts)) throw new Error('Invalid worker result');
  const names = new Set<string>();
  for (const a of v.artifacts) {
    if (!a || !ARTIFACT_NAMES.includes(a.name) || names.has(a.name) || !Number.isSafeInteger(a.bytes) || a.bytes < 0
      || a.bytes > (a.name === 'changes.patch' ? MAX_PATCH_BYTES : MAX_LOG_BYTES) || !/^[a-f0-9]{64}$/.test(a.sha256)) throw new Error('Invalid worker artifact');
    names.add(a.name);
  }
  if (!names.has('events.jsonl') || !names.has('stderr.log') || v.patchComplete !== names.has('changes.patch')
    || (v.outcome === 'completed' && (v.piExitCode !== 0 || v.piSignal !== null || !v.agentSettled || v.finalStopReason !== 'stop' || !v.patchComplete || v.issues.length !== 0))) throw new Error('Inconsistent worker result');
  return v;
}
