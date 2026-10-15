// Original file: proto/ax/v1alpha1/ax.proto

import type { Long } from '@grpc/proto-loader';

export interface ListTasksRequest {
  'atespace'?: (string);
  'limit'?: (number | string | Long);
  'offset'?: (number | string | Long);
}

export interface ListTasksRequest__Output {
  'atespace': (string);
  'limit': (string);
  'offset': (string);
}
