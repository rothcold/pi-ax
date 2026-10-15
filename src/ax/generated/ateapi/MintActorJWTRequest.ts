// Original file: proto/ateapi/ateapi.proto

import type { ObjectRef as _ateapi_ObjectRef, ObjectRef__Output as _ateapi_ObjectRef__Output } from '../ateapi/ObjectRef.js';

export interface MintActorJWTRequest {
  'audience'?: (string)[];
  'actor'?: (_ateapi_ObjectRef | null);
  'actorUid'?: (string);
}

export interface MintActorJWTRequest__Output {
  'audience': (string)[];
  'actor': (_ateapi_ObjectRef__Output | null);
  'actorUid': (string);
}
