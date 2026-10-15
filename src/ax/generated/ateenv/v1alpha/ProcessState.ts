// Original file: proto/ateenv/v1alpha/guest.proto

export const ProcessState = {
  PROCESS_STATE_UNSPECIFIED: 'PROCESS_STATE_UNSPECIFIED',
  PROCESS_STATE_RUNNING: 'PROCESS_STATE_RUNNING',
  PROCESS_STATE_EXITED: 'PROCESS_STATE_EXITED',
} as const;

export type ProcessState =
  | 'PROCESS_STATE_UNSPECIFIED'
  | 0
  | 'PROCESS_STATE_RUNNING'
  | 1
  | 'PROCESS_STATE_EXITED'
  | 2

export type ProcessState__Output = typeof ProcessState[keyof typeof ProcessState]
