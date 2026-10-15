// Original file: proto/ateapi/ateapi.proto

import type { ObjectRef as _ateapi_ObjectRef, ObjectRef__Output as _ateapi_ObjectRef__Output } from '../ateapi/ObjectRef.js';

export interface DeleteActorRequest {
  'actor'?: (_ateapi_ObjectRef | null);
  'anyState'?: (boolean);
}

export interface DeleteActorRequest__Output {
  'actor': (_ateapi_ObjectRef__Output | null);
  'anyState': (boolean);
}
