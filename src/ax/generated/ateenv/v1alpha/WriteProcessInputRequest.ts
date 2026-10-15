// Original file: proto/ateenv/v1alpha/guest.proto


export interface WriteProcessInputRequest {
  'processId'?: (string);
  'data'?: (Buffer | Uint8Array | string);
  'close'?: (boolean);
}

export interface WriteProcessInputRequest__Output {
  'processId': (string);
  'data': (Buffer);
  'close': (boolean);
}
