// Original file: proto/ateapi/ateapi.proto

import type { ResourceMetadata as _ateapi_ResourceMetadata, ResourceMetadata__Output as _ateapi_ResourceMetadata__Output } from '../ateapi/ResourceMetadata.js';
import type { TagStatus as _ateapi_TagStatus, TagStatus__Output as _ateapi_TagStatus__Output } from '../ateapi/TagStatus.js';
import type { TagScope as _ateapi_TagScope, TagScope__Output as _ateapi_TagScope__Output } from '../ateapi/TagScope.js';
import type { ObjectRef as _ateapi_ObjectRef, ObjectRef__Output as _ateapi_ObjectRef__Output } from '../ateapi/ObjectRef.js';

export interface Tag {
  'metadata'?: (_ateapi_ResourceMetadata | null);
  'status'?: (_ateapi_TagStatus | null);
  'scope'?: (_ateapi_TagScope);
  'sourceActor'?: (_ateapi_ObjectRef | null);
}

export interface Tag__Output {
  'metadata': (_ateapi_ResourceMetadata__Output | null);
  'status': (_ateapi_TagStatus__Output | null);
  'scope': (_ateapi_TagScope__Output);
  'sourceActor': (_ateapi_ObjectRef__Output | null);
}
