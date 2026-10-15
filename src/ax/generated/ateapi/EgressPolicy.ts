// Original file: proto/ateapi/ateapi.proto

import type { ResourceMetadata as _ateapi_ResourceMetadata, ResourceMetadata__Output as _ateapi_ResourceMetadata__Output } from '../ateapi/ResourceMetadata.js';
import type { EgressRule as _ateapi_EgressRule, EgressRule__Output as _ateapi_EgressRule__Output } from '../ateapi/EgressRule.js';

export interface EgressPolicy {
  'metadata'?: (_ateapi_ResourceMetadata | null);
  'rules'?: (_ateapi_EgressRule)[];
}

export interface EgressPolicy__Output {
  'metadata': (_ateapi_ResourceMetadata__Output | null);
  'rules': (_ateapi_EgressRule__Output)[];
}
