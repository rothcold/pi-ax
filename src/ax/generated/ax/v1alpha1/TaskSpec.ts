// Original file: proto/ax/v1alpha1/ax.proto

import type { EnvVar as _ax_v1alpha1_EnvVar, EnvVar__Output as _ax_v1alpha1_EnvVar__Output } from '../../ax/v1alpha1/EnvVar.js';
import type { ResourceReqs as _ax_v1alpha1_ResourceReqs, ResourceReqs__Output as _ax_v1alpha1_ResourceReqs__Output } from '../../ax/v1alpha1/ResourceReqs.js';
import type { WorkspaceRef as _ax_v1alpha1_WorkspaceRef, WorkspaceRef__Output as _ax_v1alpha1_WorkspaceRef__Output } from '../../ax/v1alpha1/WorkspaceRef.js';

export interface TaskSpec {
  'image'?: (string);
  'command'?: (string)[];
  'env'?: (_ax_v1alpha1_EnvVar)[];
  'resources'?: (_ax_v1alpha1_ResourceReqs | null);
  'workspaces'?: (_ax_v1alpha1_WorkspaceRef)[];
  'debug'?: (boolean);
}

export interface TaskSpec__Output {
  'image': (string);
  'command': (string)[];
  'env': (_ax_v1alpha1_EnvVar__Output)[];
  'resources': (_ax_v1alpha1_ResourceReqs__Output | null);
  'workspaces': (_ax_v1alpha1_WorkspaceRef__Output)[];
  'debug': (boolean);
}
