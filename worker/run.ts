import { spawn } from 'node:child_process';
import { appendFileSync, constants, writeFileSync } from 'node:fs';
import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { constants as osConstants } from 'node:os';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { readCredentialEnv, redactText } from '../src/credentials.js';
import { createPatch, createSnapshot, decodeSnapshot, materializeSnapshot, sha256, SNAPSHOT_LIMITS } from '../src/workspace.js';
import { ARTIFACT_NAMES, MAX_LOG_BYTES, MAX_REQUEST_BYTES, MAX_PATCH_BYTES, parseWorkerRequest, parseWorkerTermination, workerPaths } from '../src/worker-protocol.js';
import type { WorkerResult, WorkerStarted } from '../src/worker-protocol.js';

const MAX_LINE_BYTES = 1024 * 1024;
const PI_FLAGS = [
  '--print', '--mode', 'json', '--no-session', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-approve',
  '--tools', 'read,bash,edit,write,grep,find,ls',
  '--append-system-prompt', 'Work on task files in the current working directory, a snapshot without host Git history. Do not commit, push, load external auth/config, or alter /workspace/.pi-ax artifacts. Run relevant checks and report exact commands, outcomes, and unresolved issues. Never claim tests you did not run.',
];
async function boundedRead(file: string, max: number): Promise<Buffer> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > max) throw new Error('Worker input limit exceeded');
    const data = Buffer.alloc(max + 1);
    let size = 0;
    while (size < data.length) {
      const { bytesRead } = await handle.read(data, size, data.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > max) throw new Error('Worker input limit exceeded');
    return data.subarray(0, size);
  } finally { await handle.close(); }
}
async function atomicJson(file: string, value: unknown): Promise<void> {
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
  await rename(temp, file);
}
/** LF-only, UTF-8-safe framing. Overlong records are discarded, never silently considered valid. */
function lines(onLine: (line: string) => void, onOverflow: () => void) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let dropping = false;
  const push = (text: string) => {
    for (;;) {
      const end = text.indexOf('\n');
      const part = end < 0 ? text : text.slice(0, end);
      if (!dropping) {
        pending += part;
        if (Buffer.byteLength(pending) > MAX_LINE_BYTES) { pending = ''; dropping = true; onOverflow(); }
      }
      if (end < 0) break;
      if (!dropping) onLine(pending.replace(/\r$/, ''));
      pending = ''; dropping = false;
      text = text.slice(end + 1);
    }
  };
  return {
    push: (data: Buffer) => push(decoder.write(data)),
    end: () => {
      push(decoder.end());
      const unterminated = pending.length > 0 || dropping;
      if (pending && !dropping) onLine(pending);
      return unterminated;
    },
  };
}
/** Retains a suffix so even newline-containing credentials split across chunks are redacted. */
function redactedStream(secrets: string[], emit: (text: string) => void) {
  const decoder = new StringDecoder('utf8');
  const longest = secrets.reduce((max, secret) => Math.max(max, secret.length), 1);
  let pending = '';
  return {
    push(data: Buffer) {
      pending += decoder.write(data);
      const cut = Math.max(0, pending.length - longest + 1);
      let consumed = 0;
      let output = '';
      while (consumed < cut) {
        let matchAt = cut;
        let matchLength = 0;
        for (const secret of secrets) {
          const at = pending.indexOf(secret, consumed);
          if (at >= 0 && (at < matchAt || (at === matchAt && secret.length > matchLength))) {
            matchAt = at; matchLength = secret.length;
          }
        }
        output += pending.slice(consumed, matchAt);
        if (matchAt < cut) { output += '[REDACTED]'; consumed = matchAt + matchLength; }
        else consumed = cut;
      }
      emit(output);
      pending = pending.slice(consumed);
    },
    end() { emit(redactText(pending + decoder.end(), secrets)); pending = ''; },
  };
}
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
function redactValue(value: unknown, secrets: string[]): JsonValue {
  if (typeof value === 'string') return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [redactText(key, secrets), redactValue(item, secrets)]));
  return value === null || typeof value === 'number' || typeof value === 'boolean' ? value : null;
}
export interface WorkerOptions {
  root?: string;
  /** Test-only injection by imported callers; production CLI has no executable override. */
  executable?: string;
  executableArgs?: string[];
  environment?: NodeJS.ProcessEnv;
  supervisorExecutable?: string;
  supervisionMs?: number;
}

export async function runWorker(options: WorkerOptions = {}): Promise<WorkerResult> {
  const root = options.root ?? '/workspace';
  const paths = workerPaths(root);
  const request = parseWorkerRequest(await boundedRead(paths.request, MAX_REQUEST_BYTES));
  // mkdir is the one-shot claim. Existing marker/directory never causes a retry or overwrite.
  await mkdir(paths.artifacts, { mode: 0o700 });
  const started: WorkerStarted = { version: 1, taskId: request.taskId, snapshotSha256: request.snapshotSha256, startedAt: new Date().toISOString() };
  await atomicJson(paths.started, started);
  writeFileSync(paths.events, '', { flag: 'wx', mode: 0o600 });
  writeFileSync(paths.stderr, '', { flag: 'wx', mode: 0o600 });
  const result: WorkerResult = { ...started, finishedAt: '', outcome: 'incomplete', piExitCode: null, piSignal: null, agentSettled: false, finalStopReason: null, finalText: '', logsTruncated: false, patchComplete: false, issues: [], artifacts: [] };
  const addIssue = (issue: string) => { if (!result.issues.includes(issue)) result.issues.push(issue); };
  let baseline;
  let supervisionAttempted = false;
  try {
    baseline = decodeSnapshot(await boundedRead(paths.snapshot, SNAPSHOT_LIMITS.payloadBytes), request.snapshotSha256);
    await materializeSnapshot(baseline, paths.repository);
    const credentials = readCredentialEnv(request, options.environment ?? process.env);
    const secrets = Object.values(credentials);
    const home = path.join(paths.artifacts, 'home');
    const agentDir = path.join(home, '.pi', 'agent');
    await mkdir(agentDir, { recursive: true, mode: 0o700 });
    await writeFile(path.join(agentDir, 'settings.json'), JSON.stringify({ retry: { enabled: false, provider: { maxRetries: 0 } }, compaction: { enabled: false }, cacheWarming: 'off', enableInstallTelemetry: false, defaultProjectTrust: 'never' }), { mode: 0o600 });
    const env = {
      ...credentials, PATH: '/usr/local/bin:/usr/bin:/bin', HOME: home, TMPDIR: '/tmp', LANG: 'C.UTF-8',
      PI_CODING_AGENT_DIR: agentDir, PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0', PI_OFFLINE: '1',
      XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local', 'share'),
    };
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const append = (file: string, text: string, channel: 'out' | 'err') => {
      const size = Buffer.byteLength(text);
      if ((channel === 'out' ? stdoutBytes : stderrBytes) + size > MAX_LOG_BYTES) { result.logsTruncated = true; return; }
      appendFileSync(file, text);
      if (channel === 'out') stdoutBytes += size; else stderrBytes += size;
    };
    const out = lines((line) => {
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        if (!event || typeof event !== 'object' || typeof event.type !== 'string') throw new Error('Invalid event');
        if (event.type === 'agent_start') result.agentSettled = false;
        if (event.type === 'agent_settled') result.agentSettled = true;
        if (event.type === 'auto_retry_start' || (event.type === 'agent_end' && event.willRetry === true)) addIssue('Unexpected automatic retry');
        if (event.type === 'message_end' && event.message && typeof event.message === 'object') {
          const message = event.message as Record<string, unknown>;
          if (message.role === 'assistant') {
            result.finalStopReason = typeof message.stopReason === 'string' ? message.stopReason : null;
            if (message.stopReason === 'error' || message.stopReason === 'aborted') addIssue('Pi assistant error or abort');
            const content = Array.isArray(message.content) ? message.content : [];
            result.finalText = redactText(content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n'), secrets).slice(0, 64 * 1024);
          }
        }
        append(paths.events, JSON.stringify(redactValue(event, secrets)) + '\n', 'out');
      } catch {
        addIssue('Invalid Pi JSON event stream');
        append(paths.events, JSON.stringify({ type: 'wrapper_invalid_event', text: redactText(line, secrets) }) + '\n', 'out');
      }
    }, () => { result.logsTruncated = true; addIssue('Pi event record exceeded limit'); });
    const err = redactedStream(secrets, (text) => append(paths.stderr, text, 'err'));
    supervisionAttempted = true;
    const child = spawn(options.supervisorExecutable ?? '/opt/pi-ax/dist/worker/supervise', [String(process.pid), paths.termination, request.taskId, request.snapshotSha256,
      String(options.supervisionMs ?? 890_000), options.executable ?? '/opt/pi/node_modules/.bin/pi', ...(options.executableArgs ?? []), ...PI_FLAGS, '--provider', request.provider, '--model', request.model],
    { cwd: paths.repository, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    // Guard survives the wrapper group watchdog; PDEATHSIG triggers owned-tree cleanup.
    // Its Linux subreaper handles normal Pi bash tools that create detached groups.
    const terminate = () => { addIssue('Wrapper received termination signal'); child.kill('SIGTERM'); };
    process.on('SIGTERM', terminate);
    process.on('SIGINT', terminate);
    try {
      child.stdout.on('data', (data: Buffer) => out.push(data));
      child.stderr.on('data', (data: Buffer) => err.push(data));
      child.stdin.on('error', () => { addIssue('Pi prompt input failed'); });
      child.stdin.end(request.prompt);
      await new Promise<void>((resolve) => {
        child.once('error', () => { addIssue('Worker supervision unavailable'); });
        child.once('close', () => resolve());
      });
      if (out.end()) addIssue('Unterminated Pi JSON event stream');
      err.end();
      try {
        const proof = parseWorkerTermination(await boundedRead(paths.termination, 4096));
        if (proof.taskId !== request.taskId || proof.snapshotSha256 !== request.snapshotSha256) throw new Error('Termination correlation mismatch');
        result.piExitCode = proof.piExitCode;
        result.piSignal = proof.piSignal === null ? null : Object.entries(osConstants.signals).find(([, number]) => number === proof.piSignal)?.[0] ?? `SIGNAL_${proof.piSignal}`;
        if (proof.interrupted) addIssue('Worker supervision interrupted execution');
      } catch { addIssue('Owned-descendant termination unconfirmed'); }
    } finally { process.off('SIGTERM', terminate); process.off('SIGINT', terminate); }
    if (result.piExitCode !== 0 || result.piSignal || result.issues.includes('Pi assistant error or abort')) result.outcome = 'failed';
    else if (result.agentSettled && result.finalStopReason === 'stop' && result.issues.length === 0) result.outcome = 'completed';
    else addIssue('Pi did not produce a confirmed final completion');
  } catch {
    // Do not emit exception messages/stacks containing prompts, credentials, or untrusted paths.
    addIssue('Worker setup or execution failed');
  }
  if (!supervisionAttempted) {
    // Setup failed before any Pi/supervisor launch; no detached tool tree exists.
    await atomicJson(paths.termination, { version: 1, taskId: request.taskId, snapshotSha256: request.snapshotSha256,
      finishedAt: new Date().toISOString(), piExitCode: null, piSignal: null, interrupted: false });
  }
  if (baseline) {
    try {
      const final = await createSnapshot(paths.repository);
      const patch = await createPatch(baseline, final.snapshot);
      if (patch.length > MAX_PATCH_BYTES) throw new Error('Patch limit exceeded');
      await writeFile(paths.patch, patch, { flag: 'wx', mode: 0o600 });
      result.patchComplete = true;
    } catch { addIssue('Patch export incomplete'); }
  }
  if (!result.patchComplete && result.outcome === 'completed') result.outcome = 'incomplete';
  for (const name of ARTIFACT_NAMES) {
    if (name === 'changes.patch' && !result.patchComplete) continue;
    const file = path.join(paths.artifacts, name);
    const data = await boundedRead(file, name === 'changes.patch' ? MAX_PATCH_BYTES : MAX_LOG_BYTES);
    result.artifacts.push({ name, bytes: data.length, sha256: sha256(data) });
  }
  result.finishedAt = new Date().toISOString();
  await atomicJson(paths.result, result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runWorker().then((result) => { process.exitCode = result.outcome === 'completed' ? 0 : 1; }).catch(() => {
    // Absent result means incomplete, never success. A prior one-shot claim is not retried.
    process.stderr.write('pi-ax wrapper incomplete; inspect persisted worker artifacts\n');
    process.exitCode = 1;
  });
}
