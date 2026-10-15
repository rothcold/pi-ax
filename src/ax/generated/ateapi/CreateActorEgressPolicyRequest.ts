// Original file: proto/ateapi/ateapi.proto

import type { ObjectRef as _ateapi_ObjectRef, ObjectRef__Output as _ateapi_ObjectRef__Output } from '../ateapi/ObjectRef.js';
import type { EgressPolicy as _ateapi_EgressPolicy, EgressPolicy__Output as _ateapi_EgressPolicy__Output } from '../ateapi/EgressPolicy.js';

export interface CreateActorEgressPolicyRequest {
  'actor'?: (_ateapi_ObjectRef | null);
  'egressPolicy'?: (_ateapi_EgressPolicy | null);
}

export interface CreateActorEgressPolicyRequest__Output {
  'actor': (_ateapi_ObjectRef__Output | null);
  'egressPolicy': (_ateapi_EgressPolicy__Output | null);
}
