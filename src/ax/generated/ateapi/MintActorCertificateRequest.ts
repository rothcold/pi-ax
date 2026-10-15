// Original file: proto/ateapi/ateapi.proto

import type { ActorCertificatePurpose as _ateapi_ActorCertificatePurpose, ActorCertificatePurpose__Output as _ateapi_ActorCertificatePurpose__Output } from '../ateapi/ActorCertificatePurpose.js';
import type { ObjectRef as _ateapi_ObjectRef, ObjectRef__Output as _ateapi_ObjectRef__Output } from '../ateapi/ObjectRef.js';

export interface MintActorCertificateRequest {
  'certificateSigningRequest'?: (Buffer | Uint8Array | string);
  'purpose'?: (_ateapi_ActorCertificatePurpose);
  'actor'?: (_ateapi_ObjectRef | null);
  'actorUid'?: (string);
}

export interface MintActorCertificateRequest__Output {
  'certificateSigningRequest': (Buffer);
  'purpose': (_ateapi_ActorCertificatePurpose__Output);
  'actor': (_ateapi_ObjectRef__Output | null);
  'actorUid': (string);
}
