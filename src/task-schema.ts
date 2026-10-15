import { Type, type Static } from 'typebox';
import { EgressConfigSchema } from './config.js';

export const TASK_ID_PATTERN = '^ax-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$';
const id = Type.String({ pattern: TASK_ID_PATTERN });
const state = Type.Union([Type.Literal('pending'), Type.Literal('running'), Type.Literal('completed'), Type.Literal('failed'), Type.Literal('incomplete'), Type.Literal('unknown'), Type.Literal('cancelled'), Type.Literal('destroyed')]);
export const SpawnSchema = Type.Object({ prompt: Type.String({ minLength: 1, maxLength: 262144 }), cwd: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false });
export const StatusSchema = Type.Object({ taskId: Type.Optional(id) }, { additionalProperties: false });
export const TaskIdSchema = Type.Object({ taskId: id }, { additionalProperties: false });
export const DestroySchema = Type.Object({ taskId: id, allowUnrecoveredLoss: Type.Optional(Type.Boolean({ description: 'Explicitly allow deleting active/unknown work and losing any unexported results.' })) }, { additionalProperties: false });
export const TaskViewSchema = Type.Object({
  taskId: id, state, stage: Type.String(), active: Type.Boolean(),
  createdAt: Type.String(), updatedAt: Type.String(),
  remote: Type.String(), processId: Type.Union([Type.String(), Type.Null()]),
  processState: Type.Union([Type.Literal('running'), Type.Literal('exited'), Type.Literal('unknown')]),
  exitCode: Type.Union([Type.Integer(), Type.Null()]),
  deadlineAt: Type.Union([Type.String(), Type.Null()]), deadlineExceeded: Type.Boolean(),
  cancellationRequested: Type.Boolean(), cancellationConfirmed: Type.Boolean(),
  // Optional only for pre-supervision v1 records; missing evidence means unknown.
  terminationConfirmed: Type.Optional(Type.Boolean()),
  archiveDirectory: Type.Union([Type.String(), Type.Null()]), archiveComplete: Type.Boolean(),
  patchPath: Type.Union([Type.String(), Type.Null()]), note: Type.String(),
}, { additionalProperties: false });
export type TaskView = Static<typeof TaskViewSchema>;
export const ToolOutputSchema = Type.Object({ tasks: Type.Array(TaskViewSchema) }, { additionalProperties: false });

export const TaskRecordSchema = Type.Object({
  version: Type.Literal(1), view: TaskViewSchema,
  config: Type.Object({ controlAddress: Type.String(), routerAddress: Type.String(), atespace: Type.String(), workerImage: Type.String(), workerProvider: Type.String(), workerModel: Type.String(), credentialEnv: Type.Array(Type.String()), egress: Type.Optional(EgressConfigSchema) }, { additionalProperties: false }),
  snapshotSha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  remoteAttempted: Type.Boolean(), startAttempted: Type.Boolean(),
  resultOutcome: Type.Union([Type.Literal('completed'), Type.Literal('failed'), Type.Literal('incomplete'), Type.Null()]),
  patchComplete: Type.Boolean(),
}, { additionalProperties: false });
export type TaskRecord = Static<typeof TaskRecordSchema>;
