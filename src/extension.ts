import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { loadConfig, loadStateDir } from './config.js';
import { TaskManager } from './task-manager.js';
import { TaskStore } from './task-store.js';
import { DestroySchema, SpawnSchema, StatusSchema, TaskIdSchema, ToolOutputSchema, type TaskView } from './task-schema.js';

function output(tasks: TaskView[]) {
  const structuredContent = { tasks };
  return { content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }], details: structuredContent, structuredContent };
}

/** Registration only: no sockets, workers, filesystem writes or configuration reads in the factory. */
export default function registerAx(pi: ExtensionAPI): void {
  let manager: TaskManager | undefined;
  const getManager = () => manager ??= new TaskManager({
    store: new TaskStore(loadStateDir()),
    config: () => loadConfig(),
  });
  pi.registerTool({
    name: 'ax_spawn', label: 'AX spawn', description: 'Accept one asynchronous, one-shot Pi worker in AX from a filtered local working-tree snapshot. Returns a persisted taskId before remote preparation/completion. No retry, resume, patch apply or push. Requires explicit AX/image/provider/model configuration in the Pi agent directory ax-config.json.',
    parameters: SpawnSchema, outputSchema: ToolOutputSchema, executionMode: 'sequential',
    annotations: { destructiveHint: false, openWorldHint: true, idempotentHint: false },
    async execute(_id, params, signal, _update, ctx) {
      return output([await getManager().spawn(params.prompt, path.resolve(ctx.cwd, params.cwd ?? '.'), signal)]);
    },
  });
  pi.registerTool({
    name: 'ax_status', label: 'AX status', description: 'Query a retained task, or list/reconcile all local task records when taskId is omitted. Survives Pi restart using the same state directory. Unknown is not failed/cancelled; never respawn to recover a lost start reply.',
    parameters: StatusSchema, outputSchema: ToolOutputSchema, executionMode: 'sequential',
    annotations: { destructiveHint: false, openWorldHint: true, idempotentHint: true },
    async execute(_id, params, signal) { return output(await getManager().status(params.taskId, signal)); },
  });
  pi.registerTool({
    name: 'ax_result', label: 'AX result', description: 'Export hash-verified patch, worker logs, manifest and execution evidence into a private local task directory using atomic writes. Reports pending/unknown/partial exports honestly. Never applies patches; no automatic remote deletion.',
    parameters: TaskIdSchema, outputSchema: ToolOutputSchema, executionMode: 'sequential',
    annotations: { destructiveHint: false, openWorldHint: true, idempotentHint: true },
    async execute(_id, params, signal) { return output([await getManager().result(params.taskId, signal)]); },
  });
  pi.registerTool({
    name: 'ax_cancel', label: 'AX cancel', description: 'Request TERM, then KILL after a grace period, and require both guest wrapper exit and correlated owned-descendant termination proof. Wrapper exit without proof stays unknown and retains its reservation. A local abort or lost response is not remote cancellation. Retains artifacts; no destructive fallback. Unknown-start tasks without process ID require explicit destructive ax_destroy to stop.',
    parameters: TaskIdSchema, outputSchema: ToolOutputSchema, executionMode: 'sequential',
    annotations: { destructiveHint: true, openWorldHint: true, idempotentHint: true },
    async execute(_id, params, signal) { return output([await getManager().cancel(params.taskId, signal)]); },
  });
  pi.registerTool({
    name: 'ax_destroy', label: 'AX destroy', description: 'Delete remote AX task only after confirmed wrapper/owned-descendant termination and complete preserved patch/results, unless allowUnrecoveredLoss explicitly authorizes destructive loss of active/unknown/unrecovered work. Retains local records/archives; uncertain cleanup remains unknown.',
    parameters: DestroySchema, outputSchema: ToolOutputSchema, executionMode: 'sequential',
    annotations: { destructiveHint: true, openWorldHint: true, idempotentHint: true },
    async execute(_id, params, signal) { return output([await getManager().destroy(params.taskId, params.allowUnrecoveredLoss, signal)]); },
  });
  pi.on('session_shutdown', async () => { const current = manager; manager = undefined; await current?.close(); });
}
