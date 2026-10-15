import * as grpc from '@grpc/grpc-js';
import { DEFAULT_PROCESS_TIMEOUT_SECONDS, validateAddress, validateLabel } from '../config.js';
import { protocol } from './protocol.js';
import type { AXClient } from './generated/ax/v1alpha1/AX.js';
import type { ProcessServiceClient } from './generated/ateenv/v1alpha/ProcessService.js';
import type { FileSystemServiceClient } from './generated/ateenv/v1alpha/FileSystemService.js';
import type { Task__Output } from './generated/ax/v1alpha1/Task.js';
import type { ListTasksResponse__Output } from './generated/ax/v1alpha1/ListTasksResponse.js';
import type { Process__Output } from './generated/ateenv/v1alpha/Process.js';
import type { ProcessOutput__Output } from './generated/ateenv/v1alpha/ProcessOutput.js';
import type { WriteFileRequest } from './generated/ateenv/v1alpha/WriteFileRequest.js';
import type { WriteFileResponse__Output } from './generated/ateenv/v1alpha/WriteFileResponse.js';

export type Task = Task__Output;
export type Process = Process__Output;
export type ProcessOutput = ProcessOutput__Output;
export interface TaskRef { atespace: string; name: string }
export interface RpcOptions { timeoutMs?: number; signal?: AbortSignal }
export interface StreamOptions extends RpcOptions { maxBytes?: number }
export interface StartProcessOptions {
  command: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutSeconds?: number;
}
export interface OutputOptions extends StreamOptions {
  stdoutOffset?: string;
  stderrOffset?: string;
  follow?: boolean;
}

/** No upstream error details, metadata or cause: those may echo credentials or unbounded payloads. */
export class AxRpcError extends Error {
  readonly remoteStateUnknown = true;
  constructor(readonly operation: string, readonly code: grpc.status) {
    super(`${operation}: ${grpc.status[code] ?? 'UNKNOWN'}; remote state is not established by this error`);
    this.name = 'AxRpcError';
  }
}

function safeError(operation: string, error: unknown): AxRpcError {
  if (error instanceof AxRpcError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return new AxRpcError(operation, typeof code === 'number' && code >= 0 && code <= 16 ? code : grpc.status.UNKNOWN);
}

function callOptions(options: RpcOptions, timeoutMs: number): grpc.CallOptions {
  if (options.signal?.aborted) throw new AxRpcError('transport', grpc.status.CANCELLED);
  const ms = options.timeoutMs ?? timeoutMs;
  if (!Number.isSafeInteger(ms) || ms < 1 || ms > 3_600_000) throw new Error('RPC timeout must be 1–3600000 ms');
  return { deadline: Date.now() + ms };
}

function bindAbort(call: { cancel(): void }, signal?: AbortSignal): () => void {
  const cancel = () => call.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  return () => signal?.removeEventListener('abort', cancel);
}

function unary<T>(operation: string, options: RpcOptions, start: (callback: grpc.requestCallback<T>) => grpc.ClientUnaryCall): Promise<T> {
  return new Promise((resolve, reject) => {
    let unbind = () => {};
    const call = start((error, result) => {
      unbind();
      if (error) reject(safeError(operation, error));
      else if (result === undefined) reject(new AxRpcError(operation, grpc.status.DATA_LOSS));
      else resolve(result);
    });
    unbind = bindAbort(call, options.signal);
  });
}

function metadata(ref: TaskRef): grpc.Metadata {
  const md = new grpc.Metadata();
  md.set('ate-target-actor', `${validateLabel(ref.atespace)}/${validateLabel(ref.name)}`);
  return md;
}

function taskRef(ref: TaskRef): TaskRef {
  return { atespace: validateLabel(ref.atespace), name: validateLabel(ref.name) };
}

function limitBytes(options: StreamOptions, fallback: number): number {
  const max = options.maxBytes ?? fallback;
  if (!Number.isSafeInteger(max) || max < 0) throw new Error('maxBytes must be a nonnegative safe integer');
  return max;
}

function offset(value: string | undefined): string {
  const result = value ?? '0';
  if (!/^\d+$/.test(result) || BigInt(result) > 9223372036854775807n) throw new Error('Offset must be a nonnegative int64 decimal string');
  return result;
}

async function* boundedStream<T>(operation: string, stream: grpc.ClientReadableStream<T>, options: RpcOptions, max: number, size: (value: T) => number): AsyncGenerator<T> {
  const unbind = bindAbort(stream, options.signal);
  let bytes = 0;
  try {
    for await (const value of stream) {
      bytes += size(value);
      if (bytes > max) throw new AxRpcError(operation, grpc.status.RESOURCE_EXHAUSTED);
      yield value;
    }
  } catch (error) {
    throw safeError(operation, error);
  } finally {
    unbind();
    // Local stream cancellation never signals or terminates the guest process.
    stream.cancel();
  }
}

/** Real pinned AX/guest protocol. No retry, lifecycle inference, persistence, or automatic deletion. */
export class AxTransport {
  private readonly ax: AXClient;
  private readonly process: ProcessServiceClient;
  private readonly files: FileSystemServiceClient;
  private readonly routerAddress: string;

  constructor(addresses: { controlAddress: string; routerAddress: string }) {
    const controlAddress = validateAddress(addresses.controlAddress);
    this.routerAddress = validateAddress(addresses.routerAddress);
    const options: grpc.ChannelOptions = {
      'grpc.enable_retries': 0,
      'grpc.max_receive_message_length': 4 * 1024 * 1024,
      'grpc.max_send_message_length': 4 * 1024 * 1024,
    };
    this.ax = new protocol.ax.v1alpha1.AX(controlAddress, grpc.credentials.createInsecure(), options);
    this.process = new protocol.ateenv.v1alpha.ProcessService(this.routerAddress, grpc.credentials.createInsecure(), options);
    this.files = new protocol.ateenv.v1alpha.FileSystemService(this.routerAddress, grpc.credentials.createInsecure(), options);
  }

  close(): void {
    this.ax.close();
    this.process.close();
    this.files.close();
  }

  createTask(ref: TaskRef, image: string, options: RpcOptions = {}): Promise<Task> {
    if (!image || /[\r\n\0]/.test(image)) throw new Error('Worker image is required');
    const request = { task: {
      apiVersion: 'ax.io/v1alpha1', kind: 'Task', metadata: taskRef(ref),
      spec: { image, command: [], env: [], workspaces: [], debug: true },
    } };
    const rpc = callOptions(options, 120_000);
    return unary('CreateTask', options, (cb) => this.ax.CreateTask(request, new grpc.Metadata(), rpc, cb));
  }

  getTask(ref: TaskRef, options: RpcOptions = {}): Promise<Task> {
    const rpc = callOptions(options, 15_000);
    return unary('GetTask', options, (cb) => this.ax.GetTask(taskRef(ref), new grpc.Metadata(), rpc, cb));
  }

  /** Explicit pagination: caller must consume all pages when reconciling remote inventory. */
  async listTasks(atespace: string, page: { limit?: number; offset?: string } = {}, options: RpcOptions = {}): Promise<Task[]> {
    const limit = page.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Task page limit must be 1–1000');
    const rpc = callOptions(options, 15_000);
    const response = await unary('ListTasks', options, (cb: grpc.requestCallback<ListTasksResponse__Output>) =>
      this.ax.ListTasks({ atespace: validateLabel(atespace), limit: String(limit), offset: offset(page.offset) }, new grpc.Metadata(), rpc, cb));
    return response.tasks;
  }

  /** Initial activation only; this is not a Pi conversation-resumption feature. */
  resumeTask(ref: TaskRef, options: RpcOptions = {}): Promise<Task> {
    const rpc = callOptions(options, 120_000);
    return unary('ResumeTask', options, (cb) => this.ax.ResumeTask(taskRef(ref), new grpc.Metadata(), rpc, cb));
  }

  async deleteTask(ref: TaskRef, options: RpcOptions = {}): Promise<void> {
    const rpc = callOptions(options, 120_000);
    await unary('DeleteTask', options, (cb) => this.ax.DeleteTask(taskRef(ref), new grpc.Metadata(), rpc, cb));
  }

  /** Pinned runner exposes HTTP readiness, not a gRPC health service. No response body is retained. */
  async ready(ref: TaskRef, options: RpcOptions = {}): Promise<boolean> {
    const rpc = callOptions(options, 15_000);
    const timeout = AbortSignal.timeout(Math.max(1, Number(rpc.deadline) - Date.now()));
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    try {
      const response = await fetch(`http://${this.routerAddress}/readyz?check=workspace`, {
        headers: { 'ate-target-actor': metadata(ref).get('ate-target-actor')[0].toString() },
        signal, redirect: 'error',
      });
      await response.body?.cancel();
      if (response.status === 200) return true;
      if (response.status === 503) return false;
      throw new AxRpcError('Ready', grpc.status.UNKNOWN);
    } catch (error) {
      if (signal.aborted) throw new AxRpcError('Ready', options.signal?.aborted ? grpc.status.CANCELLED : grpc.status.DEADLINE_EXCEEDED);
      throw safeError('Ready', error);
    }
  }

  startProcess(ref: TaskRef, input: StartProcessOptions, options: RpcOptions = {}): Promise<Process> {
    if (!input.command.length || input.command.some((part) => part.includes('\0'))) throw new Error('Process command is required and must not contain NUL');
    const seconds = input.timeoutSeconds ?? DEFAULT_PROCESS_TIMEOUT_SECONDS;
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) throw new Error('Process timeout must be 1–86400 seconds');
    const rpc = callOptions(options, 30_000);
    return unary('StartProcess', options, (cb) => this.process.StartProcess({
      command: input.command, cwd: input.cwd, env: input.env, stdin: false,
      timeout: { seconds: String(seconds), nanos: 0 },
    }, metadata(ref), rpc, cb));
  }

  getProcess(ref: TaskRef, processId: string, options: RpcOptions = {}): Promise<Process> {
    const rpc = callOptions(options, 15_000);
    return unary('GetProcess', options, (cb) => this.process.GetProcess({ processId }, metadata(ref), rpc, cb));
  }

  /** Delivery acknowledgement is not exit confirmation. Poll GetProcess for PROCESS_STATE_EXITED. */
  signalProcess(ref: TaskRef, processId: string, signal: 'SIGNAL_TERM' | 'SIGNAL_KILL', options: RpcOptions = {}): Promise<Process> {
    const rpc = callOptions(options, 15_000);
    return unary('SignalProcess', options, (cb) => this.process.SignalProcess({ processId, signal }, metadata(ref), rpc, cb));
  }

  /** Raw binary chunks; the result owner must redact decoded text before presenting or archiving logs. */
  async *streamProcessOutput(ref: TaskRef, processId: string, options: OutputOptions = {}): AsyncGenerator<ProcessOutput> {
    const max = limitBytes(options, 20 * 1024 * 1024);
    const rpc = callOptions(options, options.follow ? 920_000 : 120_000);
    const stream = this.process.StreamProcessOutput({ processId, stdoutOffset: offset(options.stdoutOffset), stderrOffset: offset(options.stderrOffset), follow: options.follow ?? false }, metadata(ref), rpc);
    yield* boundedStream('StreamProcessOutput', stream, options, max, (v) => (v.stdout?.length ?? 0) + (v.stderr?.length ?? 0));
  }

  async *readFile(ref: TaskRef, path: string, options: StreamOptions = {}): AsyncGenerator<Buffer> {
    const max = limitBytes(options, 64 * 1024 * 1024);
    const rpc = callOptions(options, 120_000);
    const stream = this.files.ReadFile({ path, mode: 0 }, metadata(ref), rpc);
    for await (const value of boundedStream('ReadFile', stream, options, max, (v) => v.chunk.length)) yield value.chunk;
  }

  /** Truncating binary upload, including empty files. Resolves only after guest confirms the exact byte count. */
  async writeFile(ref: TaskRef, path: string, data: Uint8Array | AsyncIterable<Uint8Array>, options: StreamOptions & { mode?: number } = {}): Promise<{ bytesWritten: string }> {
    const max = limitBytes(options, 64 * 1024 * 1024);
    const rpc = callOptions(options, 120_000);
    let stream!: grpc.ClientWritableStream<WriteFileRequest>;
    const response = new Promise<WriteFileResponse__Output>((resolve, reject) => {
      stream = this.files.WriteFile(metadata(ref), rpc, (error, value) => {
        if (error) reject(safeError('WriteFile', error));
        else if (!value) reject(new AxRpcError('WriteFile', grpc.status.DATA_LOSS));
        else resolve(value);
      });
    });
    // A write callback carries local backpressure errors; response carries final gRPC status.
    stream.on('error', () => {});
    const unbind = bindAbort(stream, options.signal);
    let total = 0;
    const send = (value: WriteFileRequest) => new Promise<void>((resolve, reject) => {
      stream.write(value, (error?: Error | null) => error ? reject(safeError('WriteFile', error)) : resolve());
    });
    const pump = async () => {
      await send({ path, mode: options.mode ?? 0o600, seekOffset: '0', chunk: Buffer.alloc(0) });
      const chunks = data instanceof Uint8Array ? [data] : data;
      for await (const chunk of chunks) {
        total += chunk.byteLength;
        if (total > max) throw new AxRpcError('WriteFile', grpc.status.RESOURCE_EXHAUSTED);
        for (let index = 0; index < chunk.byteLength; index += 64 * 1024) {
          await send({ chunk: chunk.subarray(index, index + 64 * 1024) });
        }
      }
      stream.end();
    };
    try {
      const [, result] = await Promise.all([pump(), response]);
      if (result.bytesWritten !== String(total)) throw new AxRpcError('WriteFile', grpc.status.DATA_LOSS);
      return { bytesWritten: result.bytesWritten };
    } catch (error) {
      throw safeError('WriteFile', error);
    } finally {
      unbind();
      stream.cancel();
    }
  }
}
