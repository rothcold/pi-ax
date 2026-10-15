import { fileURLToPath } from 'node:url';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { ProtoGrpcType } from './generated/ateapi.js';

// SAFETY: generated from this exact vendored proto with these loader options, identical
// to scripts/generate-proto.mjs. This service stays separate from AX's plaintext channel.
export const egressProtocol = loadPackageDefinition(loadSync(
  fileURLToPath(new URL('../../proto/ateapi/ateapi.proto', import.meta.url)),
  { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true },
)) as unknown as ProtoGrpcType;
