// Original file: proto/ateenv/v1alpha/guest.proto

import type { Process as _ateenv_v1alpha_Process, Process__Output as _ateenv_v1alpha_Process__Output } from '../../ateenv/v1alpha/Process.js';

export interface ProcessOutput {
  'stdout'?: (Buffer | Uint8Array | string);
  'stderr'?: (Buffer | Uint8Array | string);
  'exit'?: (_ateenv_v1alpha_Process | null);
  'output'?: "stdout"|"stderr"|"exit";
}

export interface ProcessOutput__Output {
  'stdout'?: (Buffer);
  'stderr'?: (Buffer);
  'exit'?: (_ateenv_v1alpha_Process__Output | null);
  'output'?: "stdout"|"stderr"|"exit";
}
