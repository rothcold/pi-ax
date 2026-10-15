// Original file: proto/ax/v1alpha1/ax.proto

import type { SecretKeyRef as _ax_v1alpha1_SecretKeyRef, SecretKeyRef__Output as _ax_v1alpha1_SecretKeyRef__Output } from '../../ax/v1alpha1/SecretKeyRef.js';
import type { Struct as _google_protobuf_Struct, Struct__Output as _google_protobuf_Struct__Output } from '../../google/protobuf/Struct.js';

export interface ModelSpec {
  'provider'?: (string);
  'model'?: (string);
  'secretKey'?: (_ax_v1alpha1_SecretKeyRef | null);
  'parameters'?: (_google_protobuf_Struct | null);
}

export interface ModelSpec__Output {
  'provider': (string);
  'model': (string);
  'secretKey': (_ax_v1alpha1_SecretKeyRef__Output | null);
  'parameters': (_google_protobuf_Struct__Output | null);
}
