// Original file: proto/ateenv/v1alpha/guest.proto

import type { ProcessState as _ateenv_v1alpha_ProcessState, ProcessState__Output as _ateenv_v1alpha_ProcessState__Output } from '../../ateenv/v1alpha/ProcessState.js';
import type { Timestamp as _google_protobuf_Timestamp, Timestamp__Output as _google_protobuf_Timestamp__Output } from '../../google/protobuf/Timestamp.js';

export interface Process {
  'processId'?: (string);
  'command'?: (string)[];
  'pid'?: (number);
  'state'?: (_ateenv_v1alpha_ProcessState);
  'exitCode'?: (number);
  'startedAt'?: (_google_protobuf_Timestamp | null);
  'finishedAt'?: (_google_protobuf_Timestamp | null);
}

export interface Process__Output {
  'processId': (string);
  'command': (string)[];
  'pid': (number);
  'state': (_ateenv_v1alpha_ProcessState__Output);
  'exitCode': (number);
  'startedAt': (_google_protobuf_Timestamp__Output | null);
  'finishedAt': (_google_protobuf_Timestamp__Output | null);
}
