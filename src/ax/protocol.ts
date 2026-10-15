import { fileURLToPath } from 'node:url';
import { loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { ProtoGrpcType as AxProtocol } from './generated/ax.js';
import type { ProtoGrpcType as GuestProtocol } from './generated/guest.js';

// Keep these options identical to scripts/generate-proto.mjs. int64 never loses precision.
export const protoOptions = { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true };
// SAFETY: these types are generated from these exact vendored protos with the same loader options.
export const protocol = loadPackageDefinition(loadSync([
  fileURLToPath(new URL('../../proto/ax/v1alpha1/ax.proto', import.meta.url)),
  fileURLToPath(new URL('../../proto/ateenv/v1alpha/guest.proto', import.meta.url)),
], protoOptions)) as unknown as AxProtocol & GuestProtocol;
