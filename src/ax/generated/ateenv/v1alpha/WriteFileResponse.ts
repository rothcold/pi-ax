// Original file: proto/ateenv/v1alpha/guest.proto

import type { Long } from '@grpc/proto-loader';

export interface WriteFileResponse {
  'bytesWritten'?: (number | string | Long);
}

export interface WriteFileResponse__Output {
  'bytesWritten': (string);
}
