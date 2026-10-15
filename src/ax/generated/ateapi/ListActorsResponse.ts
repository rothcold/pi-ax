// Original file: proto/ateapi/ateapi.proto

import type { Actor as _ateapi_Actor, Actor__Output as _ateapi_Actor__Output } from '../ateapi/Actor.js';

export interface ListActorsResponse {
  'actors'?: (_ateapi_Actor)[];
  'nextPageToken'?: (string);
}

export interface ListActorsResponse__Output {
  'actors': (_ateapi_Actor__Output)[];
  'nextPageToken': (string);
}
