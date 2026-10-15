// Original file: proto/ax/v1alpha1/ax.proto

import type { Task as _ax_v1alpha1_Task, Task__Output as _ax_v1alpha1_Task__Output } from '../../ax/v1alpha1/Task.js';

export interface WatchTaskResponse {
  'task'?: (_ax_v1alpha1_Task | null);
  'action'?: (string);
}

export interface WatchTaskResponse__Output {
  'task': (_ax_v1alpha1_Task__Output | null);
  'action': (string);
}
