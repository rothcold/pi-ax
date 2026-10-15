// Original file: proto/ateapi/ateapi.proto

import type { ObjectRef as _ateapi_ObjectRef, ObjectRef__Output as _ateapi_ObjectRef__Output } from '../ateapi/ObjectRef.js';
import type { Timestamp as _google_protobuf_Timestamp, Timestamp__Output as _google_protobuf_Timestamp__Output } from '../google/protobuf/Timestamp.js';

export interface GoldenSnapshotStatus {
  'goldenTag'?: (_ateapi_ObjectRef | null);
  'takeGoldenSnapshotAt'?: (_google_protobuf_Timestamp | null);
  'errorMessage'?: (string);
}

export interface GoldenSnapshotStatus__Output {
  'goldenTag': (_ateapi_ObjectRef__Output | null);
  'takeGoldenSnapshotAt': (_google_protobuf_Timestamp__Output | null);
  'errorMessage': (string);
}
