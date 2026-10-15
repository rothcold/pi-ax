// Original file: proto/ax/v1alpha1/ax.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { CreateTaskRequest as _ax_v1alpha1_CreateTaskRequest, CreateTaskRequest__Output as _ax_v1alpha1_CreateTaskRequest__Output } from '../../ax/v1alpha1/CreateTaskRequest.js';
import type { DeleteModelRequest as _ax_v1alpha1_DeleteModelRequest, DeleteModelRequest__Output as _ax_v1alpha1_DeleteModelRequest__Output } from '../../ax/v1alpha1/DeleteModelRequest.js';
import type { DeleteModelResponse as _ax_v1alpha1_DeleteModelResponse, DeleteModelResponse__Output as _ax_v1alpha1_DeleteModelResponse__Output } from '../../ax/v1alpha1/DeleteModelResponse.js';
import type { DeleteTaskRequest as _ax_v1alpha1_DeleteTaskRequest, DeleteTaskRequest__Output as _ax_v1alpha1_DeleteTaskRequest__Output } from '../../ax/v1alpha1/DeleteTaskRequest.js';
import type { DeleteTaskResponse as _ax_v1alpha1_DeleteTaskResponse, DeleteTaskResponse__Output as _ax_v1alpha1_DeleteTaskResponse__Output } from '../../ax/v1alpha1/DeleteTaskResponse.js';
import type { DeleteWorkspaceRequest as _ax_v1alpha1_DeleteWorkspaceRequest, DeleteWorkspaceRequest__Output as _ax_v1alpha1_DeleteWorkspaceRequest__Output } from '../../ax/v1alpha1/DeleteWorkspaceRequest.js';
import type { DeleteWorkspaceResponse as _ax_v1alpha1_DeleteWorkspaceResponse, DeleteWorkspaceResponse__Output as _ax_v1alpha1_DeleteWorkspaceResponse__Output } from '../../ax/v1alpha1/DeleteWorkspaceResponse.js';
import type { GetModelRequest as _ax_v1alpha1_GetModelRequest, GetModelRequest__Output as _ax_v1alpha1_GetModelRequest__Output } from '../../ax/v1alpha1/GetModelRequest.js';
import type { GetTaskRequest as _ax_v1alpha1_GetTaskRequest, GetTaskRequest__Output as _ax_v1alpha1_GetTaskRequest__Output } from '../../ax/v1alpha1/GetTaskRequest.js';
import type { GetWorkspaceRequest as _ax_v1alpha1_GetWorkspaceRequest, GetWorkspaceRequest__Output as _ax_v1alpha1_GetWorkspaceRequest__Output } from '../../ax/v1alpha1/GetWorkspaceRequest.js';
import type { ListModelsRequest as _ax_v1alpha1_ListModelsRequest, ListModelsRequest__Output as _ax_v1alpha1_ListModelsRequest__Output } from '../../ax/v1alpha1/ListModelsRequest.js';
import type { ListModelsResponse as _ax_v1alpha1_ListModelsResponse, ListModelsResponse__Output as _ax_v1alpha1_ListModelsResponse__Output } from '../../ax/v1alpha1/ListModelsResponse.js';
import type { ListTasksRequest as _ax_v1alpha1_ListTasksRequest, ListTasksRequest__Output as _ax_v1alpha1_ListTasksRequest__Output } from '../../ax/v1alpha1/ListTasksRequest.js';
import type { ListTasksResponse as _ax_v1alpha1_ListTasksResponse, ListTasksResponse__Output as _ax_v1alpha1_ListTasksResponse__Output } from '../../ax/v1alpha1/ListTasksResponse.js';
import type { ListWorkspacesRequest as _ax_v1alpha1_ListWorkspacesRequest, ListWorkspacesRequest__Output as _ax_v1alpha1_ListWorkspacesRequest__Output } from '../../ax/v1alpha1/ListWorkspacesRequest.js';
import type { ListWorkspacesResponse as _ax_v1alpha1_ListWorkspacesResponse, ListWorkspacesResponse__Output as _ax_v1alpha1_ListWorkspacesResponse__Output } from '../../ax/v1alpha1/ListWorkspacesResponse.js';
import type { Model as _ax_v1alpha1_Model, Model__Output as _ax_v1alpha1_Model__Output } from '../../ax/v1alpha1/Model.js';
import type { ResumeTaskRequest as _ax_v1alpha1_ResumeTaskRequest, ResumeTaskRequest__Output as _ax_v1alpha1_ResumeTaskRequest__Output } from '../../ax/v1alpha1/ResumeTaskRequest.js';
import type { SuspendTaskRequest as _ax_v1alpha1_SuspendTaskRequest, SuspendTaskRequest__Output as _ax_v1alpha1_SuspendTaskRequest__Output } from '../../ax/v1alpha1/SuspendTaskRequest.js';
import type { Task as _ax_v1alpha1_Task, Task__Output as _ax_v1alpha1_Task__Output } from '../../ax/v1alpha1/Task.js';
import type { UpdateModelRequest as _ax_v1alpha1_UpdateModelRequest, UpdateModelRequest__Output as _ax_v1alpha1_UpdateModelRequest__Output } from '../../ax/v1alpha1/UpdateModelRequest.js';
import type { UpdateWorkspaceRequest as _ax_v1alpha1_UpdateWorkspaceRequest, UpdateWorkspaceRequest__Output as _ax_v1alpha1_UpdateWorkspaceRequest__Output } from '../../ax/v1alpha1/UpdateWorkspaceRequest.js';
import type { WatchTaskRequest as _ax_v1alpha1_WatchTaskRequest, WatchTaskRequest__Output as _ax_v1alpha1_WatchTaskRequest__Output } from '../../ax/v1alpha1/WatchTaskRequest.js';
import type { WatchTaskResponse as _ax_v1alpha1_WatchTaskResponse, WatchTaskResponse__Output as _ax_v1alpha1_WatchTaskResponse__Output } from '../../ax/v1alpha1/WatchTaskResponse.js';
import type { Workspace as _ax_v1alpha1_Workspace, Workspace__Output as _ax_v1alpha1_Workspace__Output } from '../../ax/v1alpha1/Workspace.js';

export interface AXClient extends grpc.Client {
  CreateTask(argument: _ax_v1alpha1_CreateTaskRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  CreateTask(argument: _ax_v1alpha1_CreateTaskRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  CreateTask(argument: _ax_v1alpha1_CreateTaskRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  CreateTask(argument: _ax_v1alpha1_CreateTaskRequest, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  createTask(argument: _ax_v1alpha1_CreateTaskRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  createTask(argument: _ax_v1alpha1_CreateTaskRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  createTask(argument: _ax_v1alpha1_CreateTaskRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  createTask(argument: _ax_v1alpha1_CreateTaskRequest, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  
  DeleteModel(argument: _ax_v1alpha1_DeleteModelRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteModelResponse__Output>): grpc.ClientUnaryCall;
  DeleteModel(argument: _ax_v1alpha1_DeleteModelRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_DeleteModelResponse__Output>): grpc.ClientUnaryCall;
  DeleteModel(argument: _ax_v1alpha1_DeleteModelRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteModelResponse__Output>): grpc.ClientUnaryCall;
  DeleteModel(argument: _ax_v1alpha1_DeleteModelRequest, callback: grpc.requestCallback<_ax_v1alpha1_DeleteModelResponse__Output>): grpc.ClientUnaryCall;
  deleteModel(argument: _ax_v1alpha1_DeleteModelRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteModelResponse__Output>): grpc.ClientUnaryCall;
  deleteModel(argument: _ax_v1alpha1_DeleteModelRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_DeleteModelResponse__Output>): grpc.ClientUnaryCall;
  deleteModel(argument: _ax_v1alpha1_DeleteModelRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteModelResponse__Output>): grpc.ClientUnaryCall;
  deleteModel(argument: _ax_v1alpha1_DeleteModelRequest, callback: grpc.requestCallback<_ax_v1alpha1_DeleteModelResponse__Output>): grpc.ClientUnaryCall;
  
  DeleteTask(argument: _ax_v1alpha1_DeleteTaskRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteTaskResponse__Output>): grpc.ClientUnaryCall;
  DeleteTask(argument: _ax_v1alpha1_DeleteTaskRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_DeleteTaskResponse__Output>): grpc.ClientUnaryCall;
  DeleteTask(argument: _ax_v1alpha1_DeleteTaskRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteTaskResponse__Output>): grpc.ClientUnaryCall;
  DeleteTask(argument: _ax_v1alpha1_DeleteTaskRequest, callback: grpc.requestCallback<_ax_v1alpha1_DeleteTaskResponse__Output>): grpc.ClientUnaryCall;
  deleteTask(argument: _ax_v1alpha1_DeleteTaskRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteTaskResponse__Output>): grpc.ClientUnaryCall;
  deleteTask(argument: _ax_v1alpha1_DeleteTaskRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_DeleteTaskResponse__Output>): grpc.ClientUnaryCall;
  deleteTask(argument: _ax_v1alpha1_DeleteTaskRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteTaskResponse__Output>): grpc.ClientUnaryCall;
  deleteTask(argument: _ax_v1alpha1_DeleteTaskRequest, callback: grpc.requestCallback<_ax_v1alpha1_DeleteTaskResponse__Output>): grpc.ClientUnaryCall;
  
  DeleteWorkspace(argument: _ax_v1alpha1_DeleteWorkspaceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  DeleteWorkspace(argument: _ax_v1alpha1_DeleteWorkspaceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_DeleteWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  DeleteWorkspace(argument: _ax_v1alpha1_DeleteWorkspaceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  DeleteWorkspace(argument: _ax_v1alpha1_DeleteWorkspaceRequest, callback: grpc.requestCallback<_ax_v1alpha1_DeleteWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  deleteWorkspace(argument: _ax_v1alpha1_DeleteWorkspaceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  deleteWorkspace(argument: _ax_v1alpha1_DeleteWorkspaceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_DeleteWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  deleteWorkspace(argument: _ax_v1alpha1_DeleteWorkspaceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_DeleteWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  deleteWorkspace(argument: _ax_v1alpha1_DeleteWorkspaceRequest, callback: grpc.requestCallback<_ax_v1alpha1_DeleteWorkspaceResponse__Output>): grpc.ClientUnaryCall;
  
  GetModel(argument: _ax_v1alpha1_GetModelRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  GetModel(argument: _ax_v1alpha1_GetModelRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  GetModel(argument: _ax_v1alpha1_GetModelRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  GetModel(argument: _ax_v1alpha1_GetModelRequest, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  getModel(argument: _ax_v1alpha1_GetModelRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  getModel(argument: _ax_v1alpha1_GetModelRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  getModel(argument: _ax_v1alpha1_GetModelRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  getModel(argument: _ax_v1alpha1_GetModelRequest, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  
  GetTask(argument: _ax_v1alpha1_GetTaskRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  GetTask(argument: _ax_v1alpha1_GetTaskRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  GetTask(argument: _ax_v1alpha1_GetTaskRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  GetTask(argument: _ax_v1alpha1_GetTaskRequest, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  getTask(argument: _ax_v1alpha1_GetTaskRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  getTask(argument: _ax_v1alpha1_GetTaskRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  getTask(argument: _ax_v1alpha1_GetTaskRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  getTask(argument: _ax_v1alpha1_GetTaskRequest, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  
  GetWorkspace(argument: _ax_v1alpha1_GetWorkspaceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  GetWorkspace(argument: _ax_v1alpha1_GetWorkspaceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  GetWorkspace(argument: _ax_v1alpha1_GetWorkspaceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  GetWorkspace(argument: _ax_v1alpha1_GetWorkspaceRequest, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  getWorkspace(argument: _ax_v1alpha1_GetWorkspaceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  getWorkspace(argument: _ax_v1alpha1_GetWorkspaceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  getWorkspace(argument: _ax_v1alpha1_GetWorkspaceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  getWorkspace(argument: _ax_v1alpha1_GetWorkspaceRequest, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  
  ListModels(argument: _ax_v1alpha1_ListModelsRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListModelsResponse__Output>): grpc.ClientUnaryCall;
  ListModels(argument: _ax_v1alpha1_ListModelsRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_ListModelsResponse__Output>): grpc.ClientUnaryCall;
  ListModels(argument: _ax_v1alpha1_ListModelsRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListModelsResponse__Output>): grpc.ClientUnaryCall;
  ListModels(argument: _ax_v1alpha1_ListModelsRequest, callback: grpc.requestCallback<_ax_v1alpha1_ListModelsResponse__Output>): grpc.ClientUnaryCall;
  listModels(argument: _ax_v1alpha1_ListModelsRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListModelsResponse__Output>): grpc.ClientUnaryCall;
  listModels(argument: _ax_v1alpha1_ListModelsRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_ListModelsResponse__Output>): grpc.ClientUnaryCall;
  listModels(argument: _ax_v1alpha1_ListModelsRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListModelsResponse__Output>): grpc.ClientUnaryCall;
  listModels(argument: _ax_v1alpha1_ListModelsRequest, callback: grpc.requestCallback<_ax_v1alpha1_ListModelsResponse__Output>): grpc.ClientUnaryCall;
  
  ListTasks(argument: _ax_v1alpha1_ListTasksRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListTasksResponse__Output>): grpc.ClientUnaryCall;
  ListTasks(argument: _ax_v1alpha1_ListTasksRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_ListTasksResponse__Output>): grpc.ClientUnaryCall;
  ListTasks(argument: _ax_v1alpha1_ListTasksRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListTasksResponse__Output>): grpc.ClientUnaryCall;
  ListTasks(argument: _ax_v1alpha1_ListTasksRequest, callback: grpc.requestCallback<_ax_v1alpha1_ListTasksResponse__Output>): grpc.ClientUnaryCall;
  listTasks(argument: _ax_v1alpha1_ListTasksRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListTasksResponse__Output>): grpc.ClientUnaryCall;
  listTasks(argument: _ax_v1alpha1_ListTasksRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_ListTasksResponse__Output>): grpc.ClientUnaryCall;
  listTasks(argument: _ax_v1alpha1_ListTasksRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListTasksResponse__Output>): grpc.ClientUnaryCall;
  listTasks(argument: _ax_v1alpha1_ListTasksRequest, callback: grpc.requestCallback<_ax_v1alpha1_ListTasksResponse__Output>): grpc.ClientUnaryCall;
  
  ListWorkspaces(argument: _ax_v1alpha1_ListWorkspacesRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListWorkspacesResponse__Output>): grpc.ClientUnaryCall;
  ListWorkspaces(argument: _ax_v1alpha1_ListWorkspacesRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_ListWorkspacesResponse__Output>): grpc.ClientUnaryCall;
  ListWorkspaces(argument: _ax_v1alpha1_ListWorkspacesRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListWorkspacesResponse__Output>): grpc.ClientUnaryCall;
  ListWorkspaces(argument: _ax_v1alpha1_ListWorkspacesRequest, callback: grpc.requestCallback<_ax_v1alpha1_ListWorkspacesResponse__Output>): grpc.ClientUnaryCall;
  listWorkspaces(argument: _ax_v1alpha1_ListWorkspacesRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListWorkspacesResponse__Output>): grpc.ClientUnaryCall;
  listWorkspaces(argument: _ax_v1alpha1_ListWorkspacesRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_ListWorkspacesResponse__Output>): grpc.ClientUnaryCall;
  listWorkspaces(argument: _ax_v1alpha1_ListWorkspacesRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_ListWorkspacesResponse__Output>): grpc.ClientUnaryCall;
  listWorkspaces(argument: _ax_v1alpha1_ListWorkspacesRequest, callback: grpc.requestCallback<_ax_v1alpha1_ListWorkspacesResponse__Output>): grpc.ClientUnaryCall;
  
  ResumeTask(argument: _ax_v1alpha1_ResumeTaskRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  ResumeTask(argument: _ax_v1alpha1_ResumeTaskRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  ResumeTask(argument: _ax_v1alpha1_ResumeTaskRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  ResumeTask(argument: _ax_v1alpha1_ResumeTaskRequest, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  resumeTask(argument: _ax_v1alpha1_ResumeTaskRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  resumeTask(argument: _ax_v1alpha1_ResumeTaskRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  resumeTask(argument: _ax_v1alpha1_ResumeTaskRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  resumeTask(argument: _ax_v1alpha1_ResumeTaskRequest, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  
  SuspendTask(argument: _ax_v1alpha1_SuspendTaskRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  SuspendTask(argument: _ax_v1alpha1_SuspendTaskRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  SuspendTask(argument: _ax_v1alpha1_SuspendTaskRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  SuspendTask(argument: _ax_v1alpha1_SuspendTaskRequest, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  suspendTask(argument: _ax_v1alpha1_SuspendTaskRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  suspendTask(argument: _ax_v1alpha1_SuspendTaskRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  suspendTask(argument: _ax_v1alpha1_SuspendTaskRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  suspendTask(argument: _ax_v1alpha1_SuspendTaskRequest, callback: grpc.requestCallback<_ax_v1alpha1_Task__Output>): grpc.ClientUnaryCall;
  
  UpdateModel(argument: _ax_v1alpha1_UpdateModelRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  UpdateModel(argument: _ax_v1alpha1_UpdateModelRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  UpdateModel(argument: _ax_v1alpha1_UpdateModelRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  UpdateModel(argument: _ax_v1alpha1_UpdateModelRequest, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  updateModel(argument: _ax_v1alpha1_UpdateModelRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  updateModel(argument: _ax_v1alpha1_UpdateModelRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  updateModel(argument: _ax_v1alpha1_UpdateModelRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  updateModel(argument: _ax_v1alpha1_UpdateModelRequest, callback: grpc.requestCallback<_ax_v1alpha1_Model__Output>): grpc.ClientUnaryCall;
  
  UpdateWorkspace(argument: _ax_v1alpha1_UpdateWorkspaceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  UpdateWorkspace(argument: _ax_v1alpha1_UpdateWorkspaceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  UpdateWorkspace(argument: _ax_v1alpha1_UpdateWorkspaceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  UpdateWorkspace(argument: _ax_v1alpha1_UpdateWorkspaceRequest, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  updateWorkspace(argument: _ax_v1alpha1_UpdateWorkspaceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  updateWorkspace(argument: _ax_v1alpha1_UpdateWorkspaceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  updateWorkspace(argument: _ax_v1alpha1_UpdateWorkspaceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  updateWorkspace(argument: _ax_v1alpha1_UpdateWorkspaceRequest, callback: grpc.requestCallback<_ax_v1alpha1_Workspace__Output>): grpc.ClientUnaryCall;
  
  WatchTask(argument: _ax_v1alpha1_WatchTaskRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_ax_v1alpha1_WatchTaskResponse__Output>;
  WatchTask(argument: _ax_v1alpha1_WatchTaskRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_ax_v1alpha1_WatchTaskResponse__Output>;
  watchTask(argument: _ax_v1alpha1_WatchTaskRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_ax_v1alpha1_WatchTaskResponse__Output>;
  watchTask(argument: _ax_v1alpha1_WatchTaskRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_ax_v1alpha1_WatchTaskResponse__Output>;
  
}

export interface AXHandlers extends grpc.UntypedServiceImplementation {
  CreateTask: grpc.handleUnaryCall<_ax_v1alpha1_CreateTaskRequest__Output, _ax_v1alpha1_Task>;
  
  DeleteModel: grpc.handleUnaryCall<_ax_v1alpha1_DeleteModelRequest__Output, _ax_v1alpha1_DeleteModelResponse>;
  
  DeleteTask: grpc.handleUnaryCall<_ax_v1alpha1_DeleteTaskRequest__Output, _ax_v1alpha1_DeleteTaskResponse>;
  
  DeleteWorkspace: grpc.handleUnaryCall<_ax_v1alpha1_DeleteWorkspaceRequest__Output, _ax_v1alpha1_DeleteWorkspaceResponse>;
  
  GetModel: grpc.handleUnaryCall<_ax_v1alpha1_GetModelRequest__Output, _ax_v1alpha1_Model>;
  
  GetTask: grpc.handleUnaryCall<_ax_v1alpha1_GetTaskRequest__Output, _ax_v1alpha1_Task>;
  
  GetWorkspace: grpc.handleUnaryCall<_ax_v1alpha1_GetWorkspaceRequest__Output, _ax_v1alpha1_Workspace>;
  
  ListModels: grpc.handleUnaryCall<_ax_v1alpha1_ListModelsRequest__Output, _ax_v1alpha1_ListModelsResponse>;
  
  ListTasks: grpc.handleUnaryCall<_ax_v1alpha1_ListTasksRequest__Output, _ax_v1alpha1_ListTasksResponse>;
  
  ListWorkspaces: grpc.handleUnaryCall<_ax_v1alpha1_ListWorkspacesRequest__Output, _ax_v1alpha1_ListWorkspacesResponse>;
  
  ResumeTask: grpc.handleUnaryCall<_ax_v1alpha1_ResumeTaskRequest__Output, _ax_v1alpha1_Task>;
  
  SuspendTask: grpc.handleUnaryCall<_ax_v1alpha1_SuspendTaskRequest__Output, _ax_v1alpha1_Task>;
  
  UpdateModel: grpc.handleUnaryCall<_ax_v1alpha1_UpdateModelRequest__Output, _ax_v1alpha1_Model>;
  
  UpdateWorkspace: grpc.handleUnaryCall<_ax_v1alpha1_UpdateWorkspaceRequest__Output, _ax_v1alpha1_Workspace>;
  
  WatchTask: grpc.handleServerStreamingCall<_ax_v1alpha1_WatchTaskRequest__Output, _ax_v1alpha1_WatchTaskResponse>;
  
}

export interface AXDefinition extends grpc.ServiceDefinition {
  CreateTask: MethodDefinition<_ax_v1alpha1_CreateTaskRequest, _ax_v1alpha1_Task, _ax_v1alpha1_CreateTaskRequest__Output, _ax_v1alpha1_Task__Output>
  DeleteModel: MethodDefinition<_ax_v1alpha1_DeleteModelRequest, _ax_v1alpha1_DeleteModelResponse, _ax_v1alpha1_DeleteModelRequest__Output, _ax_v1alpha1_DeleteModelResponse__Output>
  DeleteTask: MethodDefinition<_ax_v1alpha1_DeleteTaskRequest, _ax_v1alpha1_DeleteTaskResponse, _ax_v1alpha1_DeleteTaskRequest__Output, _ax_v1alpha1_DeleteTaskResponse__Output>
  DeleteWorkspace: MethodDefinition<_ax_v1alpha1_DeleteWorkspaceRequest, _ax_v1alpha1_DeleteWorkspaceResponse, _ax_v1alpha1_DeleteWorkspaceRequest__Output, _ax_v1alpha1_DeleteWorkspaceResponse__Output>
  GetModel: MethodDefinition<_ax_v1alpha1_GetModelRequest, _ax_v1alpha1_Model, _ax_v1alpha1_GetModelRequest__Output, _ax_v1alpha1_Model__Output>
  GetTask: MethodDefinition<_ax_v1alpha1_GetTaskRequest, _ax_v1alpha1_Task, _ax_v1alpha1_GetTaskRequest__Output, _ax_v1alpha1_Task__Output>
  GetWorkspace: MethodDefinition<_ax_v1alpha1_GetWorkspaceRequest, _ax_v1alpha1_Workspace, _ax_v1alpha1_GetWorkspaceRequest__Output, _ax_v1alpha1_Workspace__Output>
  ListModels: MethodDefinition<_ax_v1alpha1_ListModelsRequest, _ax_v1alpha1_ListModelsResponse, _ax_v1alpha1_ListModelsRequest__Output, _ax_v1alpha1_ListModelsResponse__Output>
  ListTasks: MethodDefinition<_ax_v1alpha1_ListTasksRequest, _ax_v1alpha1_ListTasksResponse, _ax_v1alpha1_ListTasksRequest__Output, _ax_v1alpha1_ListTasksResponse__Output>
  ListWorkspaces: MethodDefinition<_ax_v1alpha1_ListWorkspacesRequest, _ax_v1alpha1_ListWorkspacesResponse, _ax_v1alpha1_ListWorkspacesRequest__Output, _ax_v1alpha1_ListWorkspacesResponse__Output>
  ResumeTask: MethodDefinition<_ax_v1alpha1_ResumeTaskRequest, _ax_v1alpha1_Task, _ax_v1alpha1_ResumeTaskRequest__Output, _ax_v1alpha1_Task__Output>
  SuspendTask: MethodDefinition<_ax_v1alpha1_SuspendTaskRequest, _ax_v1alpha1_Task, _ax_v1alpha1_SuspendTaskRequest__Output, _ax_v1alpha1_Task__Output>
  UpdateModel: MethodDefinition<_ax_v1alpha1_UpdateModelRequest, _ax_v1alpha1_Model, _ax_v1alpha1_UpdateModelRequest__Output, _ax_v1alpha1_Model__Output>
  UpdateWorkspace: MethodDefinition<_ax_v1alpha1_UpdateWorkspaceRequest, _ax_v1alpha1_Workspace, _ax_v1alpha1_UpdateWorkspaceRequest__Output, _ax_v1alpha1_Workspace__Output>
  WatchTask: MethodDefinition<_ax_v1alpha1_WatchTaskRequest, _ax_v1alpha1_WatchTaskResponse, _ax_v1alpha1_WatchTaskRequest__Output, _ax_v1alpha1_WatchTaskResponse__Output>
}
