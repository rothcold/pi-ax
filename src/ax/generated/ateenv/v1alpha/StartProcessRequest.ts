// Original file: proto/ateenv/v1alpha/guest.proto

import type { Duration as _google_protobuf_Duration, Duration__Output as _google_protobuf_Duration__Output } from '../../google/protobuf/Duration.js';

export interface StartProcessRequest {
  'command'?: (string)[];
  'cwd'?: (string);
  'env'?: ({[key: string]: string});
  'stdin'?: (boolean);
  'timeout'?: (_google_protobuf_Duration | null);
}

export interface StartProcessRequest__Output {
  'command': (string)[];
  'cwd': (string);
  'env': ({[key: string]: string});
  'stdin': (boolean);
  'timeout': (_google_protobuf_Duration__Output | null);
}
