// Original file: proto/ateapi/ateapi.proto

import type { ActorState as _ateapi_ActorState, ActorState__Output as _ateapi_ActorState__Output } from '../ateapi/ActorState.js';
import type { WorkerAssignment as _ateapi_WorkerAssignment, WorkerAssignment__Output as _ateapi_WorkerAssignment__Output } from '../ateapi/WorkerAssignment.js';
import type { ExternalSnapshot as _ateapi_ExternalSnapshot, ExternalSnapshot__Output as _ateapi_ExternalSnapshot__Output } from '../ateapi/ExternalSnapshot.js';
import type { LocalSnapshotInfo as _ateapi_LocalSnapshotInfo, LocalSnapshotInfo__Output as _ateapi_LocalSnapshotInfo__Output } from '../ateapi/LocalSnapshotInfo.js';
import type { ExternalVolume as _ateapi_ExternalVolume, ExternalVolume__Output as _ateapi_ExternalVolume__Output } from '../ateapi/ExternalVolume.js';

export interface ActorStatus {
  'state'?: (_ateapi_ActorState);
  'workerAssignment'?: (_ateapi_WorkerAssignment | null);
  'inProgressSnapshotUri'?: (string);
  'externalSnapshot'?: (_ateapi_ExternalSnapshot | null);
  'localSnapshotInfo'?: (_ateapi_LocalSnapshotInfo | null);
  'actorVolumes'?: (_ateapi_ExternalVolume)[];
  'inProgressLocalSnapshotName'?: (string);
  'currentActorTemplateUid'?: (string);
}

export interface ActorStatus__Output {
  'state': (_ateapi_ActorState__Output);
  'workerAssignment': (_ateapi_WorkerAssignment__Output | null);
  'inProgressSnapshotUri': (string);
  'externalSnapshot': (_ateapi_ExternalSnapshot__Output | null);
  'localSnapshotInfo': (_ateapi_LocalSnapshotInfo__Output | null);
  'actorVolumes': (_ateapi_ExternalVolume__Output)[];
  'inProgressLocalSnapshotName': (string);
  'currentActorTemplateUid': (string);
}
