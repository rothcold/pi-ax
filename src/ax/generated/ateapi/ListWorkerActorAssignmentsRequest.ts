// Original file: proto/ateapi/ateapi.proto

import type { ObjectRef as _ateapi_ObjectRef, ObjectRef__Output as _ateapi_ObjectRef__Output } from '../ateapi/ObjectRef.js';

export interface ListWorkerActorAssignmentsRequest {
  'worker'?: (_ateapi_ObjectRef | null);
  'pageSize'?: (number);
  'pageToken'?: (string);
}

export interface ListWorkerActorAssignmentsRequest__Output {
  'worker': (_ateapi_ObjectRef__Output | null);
  'pageSize': (number);
  'pageToken': (string);
}
