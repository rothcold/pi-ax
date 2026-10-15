// Original file: proto/ateenv/v1alpha/guest.proto

import type { Long } from '@grpc/proto-loader';

export interface StreamProcessOutputRequest {
  'processId'?: (string);
  'stdoutOffset'?: (number | string | Long);
  'stderrOffset'?: (number | string | Long);
  'follow'?: (boolean);
}

export interface StreamProcessOutputRequest__Output {
  'processId': (string);
  'stdoutOffset': (string);
  'stderrOffset': (string);
  'follow': (boolean);
}
