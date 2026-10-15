// Original file: proto/ateenv/v1alpha/guest.proto

import type { Long } from '@grpc/proto-loader';

export interface WriteProcessInputResponse {
  'bytesWritten'?: (number | string | Long);
}

export interface WriteProcessInputResponse__Output {
  'bytesWritten': (string);
}
