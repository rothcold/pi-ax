import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Check } from 'typebox/value';
import registerAx from '../src/extension.js';
import { DestroySchema, SpawnSchema, StatusSchema, TaskIdSchema, ToolOutputSchema, type TaskRecord } from '../src/task-schema.js';
import { TaskStore } from '../src/task-store.js';

test('Pi package registers exactly five typed tools lazily and structured status works without AX configuration', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-registration-'));
  const state = path.join(root, '.pi-ax');
  const before = { HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
  process.env.HOME = root; process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
  t.after(async () => {
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(root, { recursive: true, force: true });
  });
  const tools: ToolDefinition[] = [];
  let shutdown: (() => Promise<void>) | undefined;
  const api = { registerTool: (tool: ToolDefinition) => tools.push(tool), on: (event: string, handler: () => Promise<void>) => { assert.equal(event, 'session_shutdown'); shutdown = handler; } } as unknown as ExtensionAPI;
  registerAx(api);
  assert.deepEqual(tools.map((tool) => tool.name), ['ax_spawn', 'ax_status', 'ax_result', 'ax_cancel', 'ax_destroy']);
  await assert.rejects(stat(state));
  for (const tool of tools) { assert.deepEqual(tool.outputSchema, ToolOutputSchema); assert.equal(tool.executionMode, 'sequential'); }
  const result = await tools.find((tool) => tool.name === 'ax_status')!.execute('call', {}, undefined, undefined, { cwd: root } as ExtensionToolContext);
  assert(Check(ToolOutputSchema, result.structuredContent)); assert.deepEqual(result.structuredContent, { tasks: [] });
  await assert.rejects(tools.find((tool) => tool.name === 'ax_spawn')!.execute('call', { prompt: 'test' }, undefined, undefined, { cwd: root } as ExtensionToolContext), /Missing AX configuration:.*ax-config.json/);
  await shutdown!(); await shutdown!();
  const manifest = JSON.parse(await readFile('package.json', 'utf8')) as { pi: { extensions: string[] }; peerDependencies: Record<string, string>; devDependencies: Record<string, string> };
  assert.deepEqual(manifest.pi.extensions, ['./src/extension.ts']); assert.equal(manifest.peerDependencies['@earendil-works/pi-coding-agent'], '*'); assert.equal(manifest.devDependencies['@earendil-works/pi-coding-agent'], '0.99.2');
});

test('retained v1 records recover at default or JSON stateDir without current model configuration', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-ax-recovery-'));
  const before = { HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
  process.env.HOME = root; process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
  await mkdir(process.env.PI_CODING_AGENT_DIR);
  t.after(async () => {
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(root, { recursive: true, force: true });
  });
  const taskId = 'ax-00000000-0000-0000-0000-000000000000';
  const record: TaskRecord = {
    version: 1, config: { controlAddress: 'localhost:1', routerAddress: 'localhost:2', atespace: 'unit', workerImage: 'unit', workerProvider: 'old-provider', workerModel: 'old-model', credentialEnv: ['UNAVAILABLE_KEY'] },
    snapshotSha256: 'a'.repeat(64), remoteAttempted: true, startAttempted: true, resultOutcome: null, patchComplete: false,
    view: { taskId, state: 'destroyed', stage: 'deleted', active: false, createdAt: '2026-01-01', updatedAt: '2026-01-01',
      remote: `unit/${taskId}`, processId: null, processState: 'unknown', exitCode: null, deadlineAt: null, deadlineExceeded: false,
      cancellationRequested: false, cancellationConfirmed: false, archiveDirectory: null, archiveComplete: false, patchPath: null, note: 'retained' },
  };
  for (const state of [path.join(root, '.pi-ax'), path.join(root, 'custom-state')]) {
    if (state.endsWith('custom-state')) await writeFile(path.join(process.env.PI_CODING_AGENT_DIR, 'ax-config.json'), JSON.stringify({ stateDir: state, workerModel: null }));
    const store = new TaskStore(state); await store.initialize(); await mkdir(store.directory(taskId), { mode: 0o700 }); await store.write(record);
    const tools: ToolDefinition[] = [];
    let shutdown: (() => Promise<void>) | undefined;
    registerAx({ registerTool: (tool: ToolDefinition) => tools.push(tool), on: (_event: string, handler: () => Promise<void>) => { shutdown = handler; } } as unknown as ExtensionAPI);
    try {
      for (const name of ['ax_status', 'ax_result', 'ax_cancel', 'ax_destroy']) {
        // Destroyed records are local-only: no guest RPC, no credentials required.
        const result = await tools.find((tool) => tool.name === name)!.execute('call', { taskId }, undefined, undefined, { cwd: root } as ExtensionToolContext);
        assert(Check(ToolOutputSchema, result.structuredContent));
        assert.equal(result.structuredContent.tasks[0].state, 'destroyed');
      }
      assert.deepEqual((await store.read(taskId)).config, record.config);
    } finally { await shutdown!(); }
  }
});

test('tool schemas reject unsafe identities, accidental destructive options and unknown arguments', () => {
  const taskId = 'ax-00000000-0000-0000-0000-000000000000';
  assert(Check(SpawnSchema, { prompt: 'build SQLite CRUD', cwd: '.' }));
  assert(!Check(SpawnSchema, { prompt: '' })); assert(!Check(SpawnSchema, { prompt: 'x', apiKey: 'forbidden' }));
  assert(Check(StatusSchema, {})); assert(Check(TaskIdSchema, { taskId }));
  assert(!Check(TaskIdSchema, { taskId: '../../escape' })); assert(!Check(TaskIdSchema, {}));
  assert(Check(DestroySchema, { taskId, allowUnrecoveredLoss: true }));
  assert(!Check(DestroySchema, { taskId, allowUnrecoveredLoss: 'yes' }));
  assert(!Check(DestroySchema, { taskId, force: true }));
});
