// Original file: proto/ateenv/v1alpha/guest.proto

import type { Long } from '@grpc/proto-loader';

export interface WriteFileRequest {
  'path'?: (string);
  'mode'?: (number);
  'seekOffset'?: (number | string | Long);
  'chunk'?: (Buffer | Uint8Array | string);
}

export interface WriteFileRequest__Output {
  'path': (string);
  'mode': (number);
  'seekOffset': (string);
  'chunk': (Buffer);
}
