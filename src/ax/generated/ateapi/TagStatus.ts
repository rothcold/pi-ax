// Original file: proto/ateapi/ateapi.proto

import type { ExternalSnapshot as _ateapi_ExternalSnapshot, ExternalSnapshot__Output as _ateapi_ExternalSnapshot__Output } from '../ateapi/ExternalSnapshot.js';

export interface TagStatus {
  'snapshot'?: (_ateapi_ExternalSnapshot | null);
  'actorTemplateUid'?: (string);
  'storageLocation'?: (string);
  'sourceActorUid'?: (string);
}

export interface TagStatus__Output {
  'snapshot': (_ateapi_ExternalSnapshot__Output | null);
  'actorTemplateUid': (string);
  'storageLocation': (string);
  'sourceActorUid': (string);
}
