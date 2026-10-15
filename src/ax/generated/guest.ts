import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { FileSystemServiceClient as _ateenv_v1alpha_FileSystemServiceClient, FileSystemServiceDefinition as _ateenv_v1alpha_FileSystemServiceDefinition } from './ateenv/v1alpha/FileSystemService.js';
import type { GetProcessRequest as _ateenv_v1alpha_GetProcessRequest, GetProcessRequest__Output as _ateenv_v1alpha_GetProcessRequest__Output } from './ateenv/v1alpha/GetProcessRequest.js';
import type { Process as _ateenv_v1alpha_Process, Process__Output as _ateenv_v1alpha_Process__Output } from './ateenv/v1alpha/Process.js';
import type { ProcessOutput as _ateenv_v1alpha_ProcessOutput, ProcessOutput__Output as _ateenv_v1alpha_ProcessOutput__Output } from './ateenv/v1alpha/ProcessOutput.js';
import type { ProcessServiceClient as _ateenv_v1alpha_ProcessServiceClient, ProcessServiceDefinition as _ateenv_v1alpha_ProcessServiceDefinition } from './ateenv/v1alpha/ProcessService.js';
import type { ReadFileRequest as _ateenv_v1alpha_ReadFileRequest, ReadFileRequest__Output as _ateenv_v1alpha_ReadFileRequest__Output } from './ateenv/v1alpha/ReadFileRequest.js';
import type { ReadFileResponse as _ateenv_v1alpha_ReadFileResponse, ReadFileResponse__Output as _ateenv_v1alpha_ReadFileResponse__Output } from './ateenv/v1alpha/ReadFileResponse.js';
import type { SignalProcessRequest as _ateenv_v1alpha_SignalProcessRequest, SignalProcessRequest__Output as _ateenv_v1alpha_SignalProcessRequest__Output } from './ateenv/v1alpha/SignalProcessRequest.js';
import type { StartProcessRequest as _ateenv_v1alpha_StartProcessRequest, StartProcessRequest__Output as _ateenv_v1alpha_StartProcessRequest__Output } from './ateenv/v1alpha/StartProcessRequest.js';
import type { StreamProcessOutputRequest as _ateenv_v1alpha_StreamProcessOutputRequest, StreamProcessOutputRequest__Output as _ateenv_v1alpha_StreamProcessOutputRequest__Output } from './ateenv/v1alpha/StreamProcessOutputRequest.js';
import type { WriteFileRequest as _ateenv_v1alpha_WriteFileRequest, WriteFileRequest__Output as _ateenv_v1alpha_WriteFileRequest__Output } from './ateenv/v1alpha/WriteFileRequest.js';
import type { WriteFileResponse as _ateenv_v1alpha_WriteFileResponse, WriteFileResponse__Output as _ateenv_v1alpha_WriteFileResponse__Output } from './ateenv/v1alpha/WriteFileResponse.js';
import type { WriteProcessInputRequest as _ateenv_v1alpha_WriteProcessInputRequest, WriteProcessInputRequest__Output as _ateenv_v1alpha_WriteProcessInputRequest__Output } from './ateenv/v1alpha/WriteProcessInputRequest.js';
import type { WriteProcessInputResponse as _ateenv_v1alpha_WriteProcessInputResponse, WriteProcessInputResponse__Output as _ateenv_v1alpha_WriteProcessInputResponse__Output } from './ateenv/v1alpha/WriteProcessInputResponse.js';
import type { Duration as _google_protobuf_Duration, Duration__Output as _google_protobuf_Duration__Output } from './google/protobuf/Duration.js';
import type { Timestamp as _google_protobuf_Timestamp, Timestamp__Output as _google_protobuf_Timestamp__Output } from './google/protobuf/Timestamp.js';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  ateenv: {
    v1alpha: {
      FileSystemService: SubtypeConstructor<typeof grpc.Client, _ateenv_v1alpha_FileSystemServiceClient> & { service: _ateenv_v1alpha_FileSystemServiceDefinition }
      GetProcessRequest: MessageTypeDefinition<_ateenv_v1alpha_GetProcessRequest, _ateenv_v1alpha_GetProcessRequest__Output>
      Process: MessageTypeDefinition<_ateenv_v1alpha_Process, _ateenv_v1alpha_Process__Output>
      ProcessOutput: MessageTypeDefinition<_ateenv_v1alpha_ProcessOutput, _ateenv_v1alpha_ProcessOutput__Output>
      ProcessService: SubtypeConstructor<typeof grpc.Client, _ateenv_v1alpha_ProcessServiceClient> & { service: _ateenv_v1alpha_ProcessServiceDefinition }
      ProcessState: EnumTypeDefinition
      ReadFileRequest: MessageTypeDefinition<_ateenv_v1alpha_ReadFileRequest, _ateenv_v1alpha_ReadFileRequest__Output>
      ReadFileResponse: MessageTypeDefinition<_ateenv_v1alpha_ReadFileResponse, _ateenv_v1alpha_ReadFileResponse__Output>
      Signal: EnumTypeDefinition
      SignalProcessRequest: MessageTypeDefinition<_ateenv_v1alpha_SignalProcessRequest, _ateenv_v1alpha_SignalProcessRequest__Output>
      StartProcessRequest: MessageTypeDefinition<_ateenv_v1alpha_StartProcessRequest, _ateenv_v1alpha_StartProcessRequest__Output>
      StreamProcessOutputRequest: MessageTypeDefinition<_ateenv_v1alpha_StreamProcessOutputRequest, _ateenv_v1alpha_StreamProcessOutputRequest__Output>
      WriteFileRequest: MessageTypeDefinition<_ateenv_v1alpha_WriteFileRequest, _ateenv_v1alpha_WriteFileRequest__Output>
      WriteFileResponse: MessageTypeDefinition<_ateenv_v1alpha_WriteFileResponse, _ateenv_v1alpha_WriteFileResponse__Output>
      WriteProcessInputRequest: MessageTypeDefinition<_ateenv_v1alpha_WriteProcessInputRequest, _ateenv_v1alpha_WriteProcessInputRequest__Output>
      WriteProcessInputResponse: MessageTypeDefinition<_ateenv_v1alpha_WriteProcessInputResponse, _ateenv_v1alpha_WriteProcessInputResponse__Output>
    }
  }
  google: {
    protobuf: {
      Duration: MessageTypeDefinition<_google_protobuf_Duration, _google_protobuf_Duration__Output>
      Timestamp: MessageTypeDefinition<_google_protobuf_Timestamp, _google_protobuf_Timestamp__Output>
    }
  }
}

