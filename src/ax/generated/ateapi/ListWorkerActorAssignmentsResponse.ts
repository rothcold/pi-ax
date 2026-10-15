// Original file: proto/ateapi/ateapi.proto

import type { ActorAssignment as _ateapi_ActorAssignment, ActorAssignment__Output as _ateapi_ActorAssignment__Output } from '../ateapi/ActorAssignment.js';

export interface ListWorkerActorAssignmentsResponse {
  'actorAssignments'?: (_ateapi_ActorAssignment)[];
  'nextPageToken'?: (string);
}

export interface ListWorkerActorAssignmentsResponse__Output {
  'actorAssignments': (_ateapi_ActorAssignment__Output)[];
  'nextPageToken': (string);
}
