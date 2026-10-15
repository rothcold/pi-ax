// Original file: proto/ateapi/ateapi.proto

import type { Actor as _ateapi_Actor, Actor__Output as _ateapi_Actor__Output } from '../ateapi/Actor.js';

export interface ResumeActorResponse {
  'actor'?: (_ateapi_Actor | null);
  'resumed'?: (boolean);
}

export interface ResumeActorResponse__Output {
  'actor': (_ateapi_Actor__Output | null);
  'resumed': (boolean);
}
