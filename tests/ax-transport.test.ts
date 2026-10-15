import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test, { type TestContext } from 'node:test';
import * as grpc from '@grpc/grpc-js';
import { AxRpcError, AxTransport } from '../src/ax/client.js';
import { protocol } from '../src/ax/protocol.js';
import type { AXHandlers } from '../src/ax/generated/ax/v1alpha1/AX.js';
import type { ProcessServiceHandlers } from '../src/ax/generated/ateenv/v1alpha/ProcessService.js';
import type { FileSystemServiceHandlers } from '../src/ax/generated/ateenv/v1alpha/FileSystemService.js';
import type { WriteFileRequest__Output } from '../src/ax/generated/ateenv/v1alpha/WriteFileRequest.js';

// Actual serialized gRPC clients against a local fake service, NOT real AX E2E.
const ref = { atespace: 'unit-tests', name: 'task-one' };
const running = { processId: 'process-one', state: 'PROCESS_STATE_RUNNING' as const, pid: 42, startedAt: { seconds: '9007199254740993', nanos: 123 } };

async function server(t: TestContext, handlers: {
  ax?: Partial<Pick<AXHandlers, 'CreateTask' | 'GetTask' | 'ListTasks' | 'ResumeTask' | 'DeleteTask'>>;
  process?: Partial<Pick<ProcessServiceHandlers, 'StartProcess' | 'GetProcess' | 'SignalProcess' | 'StreamProcessOutput'>>;
  files?: Partial<Pick<FileSystemServiceHandlers, 'ReadFile' | 'WriteFile'>>;
}): Promise<AxTransport> {
  const service = new grpc.Server();
  if (handlers.ax) service.addService(protocol.ax.v1alpha1.AX.service, handlers.ax);
  if (handlers.process) service.addService(protocol.ateenv.v1alpha.ProcessService.service, handlers.process);
  if (handlers.files) service.addService(protocol.ateenv.v1alpha.FileSystemService.service, handlers.files);
  const port = await new Promise<number>((resolve, reject) => service.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, value) => error ? reject(error) : resolve(value)));
  const client = new AxTransport({ controlAddress: `127.0.0.1:${port}`, routerAddress: `127.0.0.1:${port}` });
  t.after(() => { client.close(); service.forceShutdown(); });
  return client;
}

function checkRouting(call: { metadata: grpc.Metadata; getDeadline(): grpc.Deadline }): void {
  assert.deepEqual(call.metadata.get('ate-target-actor'), ['unit-tests/task-one']);
  assert.notEqual(call.getDeadline(), Infinity);
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

test('vendored schemas exactly match pinned source hashes and service paths', async () => {
  for (const [path, hash] of [
    ['proto/ax/v1alpha1/ax.proto', 'fa3466e3de468c065d57b333775402196ae13268ae577d16ec9a9f2f62177907'],
    ['proto/ateenv/v1alpha/guest.proto', 'e42206e1ce07ce515caae4754de58a29211cbf632cb2316440299f3856f7240d'],
  ]) assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), hash);
  assert.equal(protocol.ax.v1alpha1.AX.service.CreateTask.path, '/ax.v1alpha1.AX/CreateTask');
  assert.equal(protocol.ateenv.v1alpha.ProcessService.service.StartProcess.path, '/ateenv.v1alpha.ProcessService/StartProcess');
  assert.equal(protocol.ateenv.v1alpha.FileSystemService.service.WriteFile.path, '/ateenv.v1alpha.FileSystemService/WriteFile');
});

test('AX create/get/list/resume/delete serialize correct fields, empty command and debug true', async (t) => {
  const seen: string[] = [];
  const client = await server(t, { ax: {
    CreateTask(call, cb) {
      const task = call.request.task!;
      assert.equal(task.apiVersion, 'ax.io/v1alpha1');
      assert.equal(task.kind, 'Task');
      assert.equal(task.metadata?.name, ref.name);
      assert.equal(task.metadata?.atespace, ref.atespace);
      assert.deepEqual(task.spec, { image: 'local/worker:unit', command: [], env: [], resources: null, workspaces: [], debug: true });
      assert.notEqual(call.getDeadline(), Infinity);
      seen.push('create'); cb(null, task);
    },
    GetTask(call, cb) { assert.deepEqual(call.request, ref); seen.push('get'); cb(null, { metadata: ref, status: { phase: 'Suspended' } }); },
    ListTasks(call, cb) { assert.deepEqual(call.request, { atespace: ref.atespace, limit: '17', offset: '9007199254740993' }); seen.push('list'); cb(null, { tasks: [{ metadata: ref }] }); },
    ResumeTask(call, cb) { assert.deepEqual(call.request, ref); seen.push('resume'); cb(null, { metadata: ref, status: { phase: 'Running' } }); },
    DeleteTask(call, cb) { assert.deepEqual(call.request, ref); seen.push('delete'); cb(null, {}); },
  } });
  await client.createTask(ref, 'local/worker:unit');
  assert.equal((await client.getTask(ref)).status?.phase, 'Suspended');
  assert.equal((await client.listTasks(ref.atespace, { limit: 17, offset: '9007199254740993' })).length, 1);
  assert.equal((await client.resumeTask(ref)).status?.phase, 'Running');
  await client.deleteTask(ref);
  assert.deepEqual(seen, ['create', 'get', 'list', 'resume', 'delete']);
});

test('guest process env, 900s duration, enum and timestamp contract; signal ack can remain RUNNING', async (t) => {
  const client = await server(t, { process: {
    StartProcess(call, cb) {
      checkRouting(call);
      assert.deepEqual(call.request, { command: ['node', '/worker/run.mjs'], cwd: '/workspace', env: { API_KEY: 'sentinel' }, stdin: false, timeout: { seconds: '900', nanos: 0 } });
      cb(null, running);
    },
    GetProcess(call, cb) { checkRouting(call); assert.equal(call.request.processId, running.processId); cb(null, { ...running, state: 'PROCESS_STATE_EXITED', exitCode: 7, finishedAt: { seconds: '1700000000' } }); },
    SignalProcess(call, cb) { checkRouting(call); assert.equal(call.request.signal, 'SIGNAL_TERM'); cb(null, running); },
  } });
  const process = await client.startProcess(ref, { command: ['node', '/worker/run.mjs'], cwd: '/workspace', env: { API_KEY: 'sentinel' } });
  assert.equal(process.startedAt?.seconds, '9007199254740993');
  assert.equal(process.startedAt?.nanos, 123);
  assert.equal(process.state, 'PROCESS_STATE_RUNNING');
  assert.equal((await client.signalProcess(ref, process.processId, 'SIGNAL_TERM')).state, 'PROCESS_STATE_RUNNING');
  assert.equal((await client.getProcess(ref, process.processId)).exitCode, 7);
});

test('binary upload/download, mode zero reads, offsets and output oneof survive wire roundtrip', async (t) => {
  const binary = Buffer.from([0, 255, 1, 128, 10]);
  const received: WriteFileRequest__Output[] = [];
  const client = await server(t, {
    files: {
      WriteFile(call, cb) {
        checkRouting(call);
        call.on('data', (chunk: WriteFileRequest__Output) => received.push(chunk));
        call.on('end', () => cb(null, { bytesWritten: String(received.reduce((sum, value) => sum + value.chunk.length, 0)) }));
      },
      ReadFile(call) { checkRouting(call); assert.equal(call.request.mode, 0); assert.equal(call.request.path, '/workspace/result'); call.write({ chunk: binary }); call.end(); },
    },
    process: {
      StreamProcessOutput(call) {
        checkRouting(call);
        assert.equal(call.request.stdoutOffset, '9007199254740993');
        assert.equal(call.request.stderrOffset, '10');
        assert.equal(call.request.follow, false);
        call.write({ stdout: binary }); call.write({ stderr: Buffer.from('error') });
        call.write({ exit: { ...running, state: 'PROCESS_STATE_EXITED', exitCode: 143 } }); call.end();
      },
    },
  });
  assert.deepEqual(await client.writeFile(ref, '/workspace/input', binary, { mode: 0o755 }), { bytesWritten: '5' });
  assert.equal(received[0].path, '/workspace/input');
  assert.equal(received[0].mode, 0o755);
  assert.equal(received[0].seekOffset, '0');
  assert.deepEqual(Buffer.concat(received.map((value) => value.chunk)), binary);
  assert.deepEqual(Buffer.concat(await collect(client.readFile(ref, '/workspace/result'))), binary);
  const output = await collect(client.streamProcessOutput(ref, 'process-one', { stdoutOffset: '9007199254740993', stderrOffset: '10' }));
  assert.equal(output[0].output, 'stdout'); assert.deepEqual(output[0].stdout, binary);
  assert.equal(output[1].output, 'stderr'); assert.equal(output[2].exit?.exitCode, 143);
});

test('empty file upload still sends a truncating first request', async (t) => {
  let chunks = 0;
  const client = await server(t, { files: { WriteFile(call, cb) {
    call.on('data', (request: WriteFileRequest__Output) => {
      chunks++; assert.equal(request.path, '/empty'); assert.equal(request.seekOffset, '0'); assert.equal(request.chunk.length, 0);
    });
    call.on('end', () => cb(null, { bytesWritten: '0' }));
  } } });
  assert.equal((await client.writeFile(ref, '/empty', Buffer.alloc(0))).bytesWritten, '0');
  assert.equal(chunks, 1);
});

test('upload checks guest byte acknowledgement and bounds, download never silently truncates', async (t) => {
  const client = await server(t, { files: {
    WriteFile(call, cb) { call.resume(); call.on('end', () => cb(null, { bytesWritten: '999' })); },
    ReadFile(call) { call.write({ chunk: Buffer.from('too long') }); call.end(); },
  } });
  await assert.rejects(client.writeFile(ref, '/file', Buffer.from('abc')), (error: unknown) => error instanceof AxRpcError && error.code === grpc.status.DATA_LOSS);
  await assert.rejects(client.writeFile(ref, '/file', Buffer.from('abc'), { maxBytes: 1 }), (error: unknown) => error instanceof AxRpcError && error.code === grpc.status.RESOURCE_EXHAUSTED);
  await assert.rejects(collect(client.readFile(ref, '/file', { maxBytes: 2 })), (error: unknown) => error instanceof AxRpcError && error.code === grpc.status.RESOURCE_EXHAUSTED);
});

test('lost StartProcess reply is unknown and never retried; untrusted details never escape', async (t) => {
  let starts = 0;
  const client = await server(t, { process: { StartProcess(_call, cb) {
    starts++; cb({ code: grpc.status.UNAVAILABLE, details: `sentinel-secret ${'x'.repeat(10000)}` });
  } } });
  await assert.rejects(client.startProcess(ref, { command: ['worker'], cwd: '/workspace', env: { KEY: 'sentinel-secret' } }), (error: unknown) => {
    assert.ok(error instanceof AxRpcError);
    assert.equal(error.code, grpc.status.UNAVAILABLE);
    assert.equal(error.remoteStateUnknown, true);
    assert.equal(error.message.includes('sentinel-secret'), false);
    assert.ok(error.message.length < 160);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(starts, 1);
});

test('deadline and AbortSignal only cancel transport, never SignalProcess', async (t) => {
  let signals = 0;
  let started!: () => void;
  let entered = new Promise<void>((resolve) => { started = resolve; });
  const client = await server(t, { process: {
    GetProcess() { started(); },
    SignalProcess(_call, cb) { signals++; cb(null, running); },
  } });
  await assert.rejects(client.getProcess(ref, 'process-one', { timeoutMs: 30 }), (error: unknown) => error instanceof AxRpcError && error.code === grpc.status.DEADLINE_EXCEEDED);
  entered = new Promise<void>((resolve) => { started = resolve; });
  const abort = new AbortController();
  const pending = client.getProcess(ref, 'process-one', { signal: abort.signal });
  await entered; abort.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof AxRpcError && error.code === grpc.status.CANCELLED);
  assert.equal(signals, 0);
});

test('log bounds are explicit failures; breaking a read stream is transport cancellation only', async (t) => {
  let signals = 0;
  const client = await server(t, { process: {
    StreamProcessOutput(call) { call.write({ stdout: Buffer.from('abcd') }); call.write({ stderr: Buffer.from('efgh') }); call.end(); },
    SignalProcess(_call, cb) { signals++; cb(null, running); },
  } });
  await assert.rejects(collect(client.streamProcessOutput(ref, 'process-one', { maxBytes: 3 })), (error: unknown) => error instanceof AxRpcError && error.code === grpc.status.RESOURCE_EXHAUSTED);
  for await (const value of client.streamProcessOutput(ref, 'process-one')) { assert.ok(value.stdout); break; }
  assert.equal(signals, 0);
});

test('real readiness endpoint and routing header, false on 503, deadline on stalled endpoint', async (t) => {
  let responseStatus = 503;
  const http = createServer((request, response) => {
    assert.equal(request.url, '/readyz?check=workspace');
    assert.equal(request.headers['ate-target-actor'], 'unit-tests/task-one');
    if (responseStatus === 0) return;
    response.writeHead(responseStatus); response.end('untrusted body');
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address(); assert.ok(address && typeof address !== 'string');
  const client = new AxTransport({ controlAddress: `127.0.0.1:${address.port}`, routerAddress: `127.0.0.1:${address.port}` });
  t.after(() => { client.close(); http.closeAllConnections(); http.close(); });
  assert.equal(await client.ready(ref), false);
  responseStatus = 200; assert.equal(await client.ready(ref), true);
  responseStatus = 404; await assert.rejects(client.ready(ref), AxRpcError);
  responseStatus = 0; await assert.rejects(client.ready(ref, { timeoutMs: 30 }), (error: unknown) => error instanceof AxRpcError && error.code === grpc.status.DEADLINE_EXCEEDED);
});

test('file and log streaming RPCs have deadlines and strip remote errors', async (t) => {
  const client = await server(t, {
    process: { StreamProcessOutput(call) { checkRouting(call); } },
    files: {
      ReadFile(call) {
        checkRouting(call);
        if (call.request.path === '/error') call.emit('error', Object.assign(new Error('sentinel-secret'), { code: grpc.status.PERMISSION_DENIED }));
      },
      WriteFile(call) { checkRouting(call); call.resume(); },
    },
  });
  const deadline = (error: unknown) => error instanceof AxRpcError && error.code === grpc.status.DEADLINE_EXCEEDED;
  await assert.rejects(collect(client.readFile(ref, '/stalled', { timeoutMs: 30 })), deadline);
  await assert.rejects(collect(client.streamProcessOutput(ref, 'process-one', { timeoutMs: 30 })), deadline);
  await assert.rejects(client.writeFile(ref, '/stalled', Buffer.from('data'), { timeoutMs: 30 }), deadline);
  await assert.rejects(collect(client.readFile(ref, '/error', { timeoutMs: 1000 })), (error: unknown) => {
    assert.ok(error instanceof AxRpcError);
    assert.equal(error.code, grpc.status.PERMISSION_DENIED);
    assert.equal(error.message.includes('sentinel-secret'), false);
    return true;
  });
});
