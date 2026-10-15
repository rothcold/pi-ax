// Original file: proto/ateenv/v1alpha/guest.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { ReadFileRequest as _ateenv_v1alpha_ReadFileRequest, ReadFileRequest__Output as _ateenv_v1alpha_ReadFileRequest__Output } from '../../ateenv/v1alpha/ReadFileRequest.js';
import type { ReadFileResponse as _ateenv_v1alpha_ReadFileResponse, ReadFileResponse__Output as _ateenv_v1alpha_ReadFileResponse__Output } from '../../ateenv/v1alpha/ReadFileResponse.js';
import type { WriteFileRequest as _ateenv_v1alpha_WriteFileRequest, WriteFileRequest__Output as _ateenv_v1alpha_WriteFileRequest__Output } from '../../ateenv/v1alpha/WriteFileRequest.js';
import type { WriteFileResponse as _ateenv_v1alpha_WriteFileResponse, WriteFileResponse__Output as _ateenv_v1alpha_WriteFileResponse__Output } from '../../ateenv/v1alpha/WriteFileResponse.js';

export interface FileSystemServiceClient extends grpc.Client {
  ReadFile(argument: _ateenv_v1alpha_ReadFileRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_ateenv_v1alpha_ReadFileResponse__Output>;
  ReadFile(argument: _ateenv_v1alpha_ReadFileRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_ateenv_v1alpha_ReadFileResponse__Output>;
  readFile(argument: _ateenv_v1alpha_ReadFileRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_ateenv_v1alpha_ReadFileResponse__Output>;
  readFile(argument: _ateenv_v1alpha_ReadFileRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_ateenv_v1alpha_ReadFileResponse__Output>;
  
  WriteFile(metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_WriteFileResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteFileRequest>;
  WriteFile(metadata: grpc.Metadata, callback: grpc.requestCallback<_ateenv_v1alpha_WriteFileResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteFileRequest>;
  WriteFile(options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_WriteFileResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteFileRequest>;
  WriteFile(callback: grpc.requestCallback<_ateenv_v1alpha_WriteFileResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteFileRequest>;
  writeFile(metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_WriteFileResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteFileRequest>;
  writeFile(metadata: grpc.Metadata, callback: grpc.requestCallback<_ateenv_v1alpha_WriteFileResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteFileRequest>;
  writeFile(options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_WriteFileResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteFileRequest>;
  writeFile(callback: grpc.requestCallback<_ateenv_v1alpha_WriteFileResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteFileRequest>;
  
}

export interface FileSystemServiceHandlers extends grpc.UntypedServiceImplementation {
  ReadFile: grpc.handleServerStreamingCall<_ateenv_v1alpha_ReadFileRequest__Output, _ateenv_v1alpha_ReadFileResponse>;
  
  WriteFile: grpc.handleClientStreamingCall<_ateenv_v1alpha_WriteFileRequest__Output, _ateenv_v1alpha_WriteFileResponse>;
  
}

export interface FileSystemServiceDefinition extends grpc.ServiceDefinition {
  ReadFile: MethodDefinition<_ateenv_v1alpha_ReadFileRequest, _ateenv_v1alpha_ReadFileResponse, _ateenv_v1alpha_ReadFileRequest__Output, _ateenv_v1alpha_ReadFileResponse__Output>
  WriteFile: MethodDefinition<_ateenv_v1alpha_WriteFileRequest, _ateenv_v1alpha_WriteFileResponse, _ateenv_v1alpha_WriteFileRequest__Output, _ateenv_v1alpha_WriteFileResponse__Output>
}
