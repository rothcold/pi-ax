// Original file: proto/ax/v1alpha1/ax.proto

import type { ObjectMeta as _ax_v1alpha1_ObjectMeta, ObjectMeta__Output as _ax_v1alpha1_ObjectMeta__Output } from '../../ax/v1alpha1/ObjectMeta.js';
import type { ModelSpec as _ax_v1alpha1_ModelSpec, ModelSpec__Output as _ax_v1alpha1_ModelSpec__Output } from '../../ax/v1alpha1/ModelSpec.js';

export interface Model {
  'apiVersion'?: (string);
  'kind'?: (string);
  'metadata'?: (_ax_v1alpha1_ObjectMeta | null);
  'spec'?: (_ax_v1alpha1_ModelSpec | null);
}

export interface Model__Output {
  'apiVersion': (string);
  'kind': (string);
  'metadata': (_ax_v1alpha1_ObjectMeta__Output | null);
  'spec': (_ax_v1alpha1_ModelSpec__Output | null);
}
