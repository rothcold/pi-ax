// Original file: proto/ateenv/v1alpha/guest.proto

import type { Signal as _ateenv_v1alpha_Signal, Signal__Output as _ateenv_v1alpha_Signal__Output } from '../../ateenv/v1alpha/Signal.js';

export interface SignalProcessRequest {
  'processId'?: (string);
  'signal'?: (_ateenv_v1alpha_Signal);
}

export interface SignalProcessRequest__Output {
  'processId': (string);
  'signal': (_ateenv_v1alpha_Signal__Output);
}
