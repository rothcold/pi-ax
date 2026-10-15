// Original file: proto/ateenv/v1alpha/guest.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { GetProcessRequest as _ateenv_v1alpha_GetProcessRequest, GetProcessRequest__Output as _ateenv_v1alpha_GetProcessRequest__Output } from '../../ateenv/v1alpha/GetProcessRequest.js';
import type { Process as _ateenv_v1alpha_Process, Process__Output as _ateenv_v1alpha_Process__Output } from '../../ateenv/v1alpha/Process.js';
import type { ProcessOutput as _ateenv_v1alpha_ProcessOutput, ProcessOutput__Output as _ateenv_v1alpha_ProcessOutput__Output } from '../../ateenv/v1alpha/ProcessOutput.js';
import type { SignalProcessRequest as _ateenv_v1alpha_SignalProcessRequest, SignalProcessRequest__Output as _ateenv_v1alpha_SignalProcessRequest__Output } from '../../ateenv/v1alpha/SignalProcessRequest.js';
import type { StartProcessRequest as _ateenv_v1alpha_StartProcessRequest, StartProcessRequest__Output as _ateenv_v1alpha_StartProcessRequest__Output } from '../../ateenv/v1alpha/StartProcessRequest.js';
import type { StreamProcessOutputRequest as _ateenv_v1alpha_StreamProcessOutputRequest, StreamProcessOutputRequest__Output as _ateenv_v1alpha_StreamProcessOutputRequest__Output } from '../../ateenv/v1alpha/StreamProcessOutputRequest.js';
import type { WriteProcessInputRequest as _ateenv_v1alpha_WriteProcessInputRequest, WriteProcessInputRequest__Output as _ateenv_v1alpha_WriteProcessInputRequest__Output } from '../../ateenv/v1alpha/WriteProcessInputRequest.js';
import type { WriteProcessInputResponse as _ateenv_v1alpha_WriteProcessInputResponse, WriteProcessInputResponse__Output as _ateenv_v1alpha_WriteProcessInputResponse__Output } from '../../ateenv/v1alpha/WriteProcessInputResponse.js';

export interface ProcessServiceClient extends grpc.Client {
  GetProcess(argument: _ateenv_v1alpha_GetProcessRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  GetProcess(argument: _ateenv_v1alpha_GetProcessRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  GetProcess(argument: _ateenv_v1alpha_GetProcessRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  GetProcess(argument: _ateenv_v1alpha_GetProcessRequest, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  getProcess(argument: _ateenv_v1alpha_GetProcessRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  getProcess(argument: _ateenv_v1alpha_GetProcessRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  getProcess(argument: _ateenv_v1alpha_GetProcessRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  getProcess(argument: _ateenv_v1alpha_GetProcessRequest, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  
  SignalProcess(argument: _ateenv_v1alpha_SignalProcessRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  SignalProcess(argument: _ateenv_v1alpha_SignalProcessRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  SignalProcess(argument: _ateenv_v1alpha_SignalProcessRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  SignalProcess(argument: _ateenv_v1alpha_SignalProcessRequest, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  signalProcess(argument: _ateenv_v1alpha_SignalProcessRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  signalProcess(argument: _ateenv_v1alpha_SignalProcessRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  signalProcess(argument: _ateenv_v1alpha_SignalProcessRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  signalProcess(argument: _ateenv_v1alpha_SignalProcessRequest, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  
  StartProcess(argument: _ateenv_v1alpha_StartProcessRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  StartProcess(argument: _ateenv_v1alpha_StartProcessRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  StartProcess(argument: _ateenv_v1alpha_StartProcessRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  StartProcess(argument: _ateenv_v1alpha_StartProcessRequest, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  startProcess(argument: _ateenv_v1alpha_StartProcessRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  startProcess(argument: _ateenv_v1alpha_StartProcessRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  startProcess(argument: _ateenv_v1alpha_StartProcessRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  startProcess(argument: _ateenv_v1alpha_StartProcessRequest, callback: grpc.requestCallback<_ateenv_v1alpha_Process__Output>): grpc.ClientUnaryCall;
  
  StreamProcessOutput(argument: _ateenv_v1alpha_StreamProcessOutputRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_ateenv_v1alpha_ProcessOutput__Output>;
  StreamProcessOutput(argument: _ateenv_v1alpha_StreamProcessOutputRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_ateenv_v1alpha_ProcessOutput__Output>;
  streamProcessOutput(argument: _ateenv_v1alpha_StreamProcessOutputRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_ateenv_v1alpha_ProcessOutput__Output>;
  streamProcessOutput(argument: _ateenv_v1alpha_StreamProcessOutputRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_ateenv_v1alpha_ProcessOutput__Output>;
  
  WriteProcessInput(metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_WriteProcessInputResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteProcessInputRequest>;
  WriteProcessInput(metadata: grpc.Metadata, callback: grpc.requestCallback<_ateenv_v1alpha_WriteProcessInputResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteProcessInputRequest>;
  WriteProcessInput(options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_WriteProcessInputResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteProcessInputRequest>;
  WriteProcessInput(callback: grpc.requestCallback<_ateenv_v1alpha_WriteProcessInputResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteProcessInputRequest>;
  writeProcessInput(metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_WriteProcessInputResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteProcessInputRequest>;
  writeProcessInput(metadata: grpc.Metadata, callback: grpc.requestCallback<_ateenv_v1alpha_WriteProcessInputResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteProcessInputRequest>;
  writeProcessInput(options: grpc.CallOptions, callback: grpc.requestCallback<_ateenv_v1alpha_WriteProcessInputResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteProcessInputRequest>;
  writeProcessInput(callback: grpc.requestCallback<_ateenv_v1alpha_WriteProcessInputResponse__Output>): grpc.ClientWritableStream<_ateenv_v1alpha_WriteProcessInputRequest>;
  
}

export interface ProcessServiceHandlers extends grpc.UntypedServiceImplementation {
  GetProcess: grpc.handleUnaryCall<_ateenv_v1alpha_GetProcessRequest__Output, _ateenv_v1alpha_Process>;
  
  SignalProcess: grpc.handleUnaryCall<_ateenv_v1alpha_SignalProcessRequest__Output, _ateenv_v1alpha_Process>;
  
  StartProcess: grpc.handleUnaryCall<_ateenv_v1alpha_StartProcessRequest__Output, _ateenv_v1alpha_Process>;
  
  StreamProcessOutput: grpc.handleServerStreamingCall<_ateenv_v1alpha_StreamProcessOutputRequest__Output, _ateenv_v1alpha_ProcessOutput>;
  
  WriteProcessInput: grpc.handleClientStreamingCall<_ateenv_v1alpha_WriteProcessInputRequest__Output, _ateenv_v1alpha_WriteProcessInputResponse>;
  
}

export interface ProcessServiceDefinition extends grpc.ServiceDefinition {
  GetProcess: MethodDefinition<_ateenv_v1alpha_GetProcessRequest, _ateenv_v1alpha_Process, _ateenv_v1alpha_GetProcessRequest__Output, _ateenv_v1alpha_Process__Output>
  SignalProcess: MethodDefinition<_ateenv_v1alpha_SignalProcessRequest, _ateenv_v1alpha_Process, _ateenv_v1alpha_SignalProcessRequest__Output, _ateenv_v1alpha_Process__Output>
  StartProcess: MethodDefinition<_ateenv_v1alpha_StartProcessRequest, _ateenv_v1alpha_Process, _ateenv_v1alpha_StartProcessRequest__Output, _ateenv_v1alpha_Process__Output>
  StreamProcessOutput: MethodDefinition<_ateenv_v1alpha_StreamProcessOutputRequest, _ateenv_v1alpha_ProcessOutput, _ateenv_v1alpha_StreamProcessOutputRequest__Output, _ateenv_v1alpha_ProcessOutput__Output>
  WriteProcessInput: MethodDefinition<_ateenv_v1alpha_WriteProcessInputRequest, _ateenv_v1alpha_WriteProcessInputResponse, _ateenv_v1alpha_WriteProcessInputRequest__Output, _ateenv_v1alpha_WriteProcessInputResponse__Output>
}
