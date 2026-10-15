import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { AXClient as _ax_v1alpha1_AXClient, AXDefinition as _ax_v1alpha1_AXDefinition } from './ax/v1alpha1/AX.js';
import type { Condition as _ax_v1alpha1_Condition, Condition__Output as _ax_v1alpha1_Condition__Output } from './ax/v1alpha1/Condition.js';
import type { CreateTaskRequest as _ax_v1alpha1_CreateTaskRequest, CreateTaskRequest__Output as _ax_v1alpha1_CreateTaskRequest__Output } from './ax/v1alpha1/CreateTaskRequest.js';
import type { DeleteModelRequest as _ax_v1alpha1_DeleteModelRequest, DeleteModelRequest__Output as _ax_v1alpha1_DeleteModelRequest__Output } from './ax/v1alpha1/DeleteModelRequest.js';
import type { DeleteModelResponse as _ax_v1alpha1_DeleteModelResponse, DeleteModelResponse__Output as _ax_v1alpha1_DeleteModelResponse__Output } from './ax/v1alpha1/DeleteModelResponse.js';
import type { DeleteTaskRequest as _ax_v1alpha1_DeleteTaskRequest, DeleteTaskRequest__Output as _ax_v1alpha1_DeleteTaskRequest__Output } from './ax/v1alpha1/DeleteTaskRequest.js';
import type { DeleteTaskResponse as _ax_v1alpha1_DeleteTaskResponse, DeleteTaskResponse__Output as _ax_v1alpha1_DeleteTaskResponse__Output } from './ax/v1alpha1/DeleteTaskResponse.js';
import type { DeleteWorkspaceRequest as _ax_v1alpha1_DeleteWorkspaceRequest, DeleteWorkspaceRequest__Output as _ax_v1alpha1_DeleteWorkspaceRequest__Output } from './ax/v1alpha1/DeleteWorkspaceRequest.js';
import type { DeleteWorkspaceResponse as _ax_v1alpha1_DeleteWorkspaceResponse, DeleteWorkspaceResponse__Output as _ax_v1alpha1_DeleteWorkspaceResponse__Output } from './ax/v1alpha1/DeleteWorkspaceResponse.js';
import type { EnvVar as _ax_v1alpha1_EnvVar, EnvVar__Output as _ax_v1alpha1_EnvVar__Output } from './ax/v1alpha1/EnvVar.js';
import type { File as _ax_v1alpha1_File, File__Output as _ax_v1alpha1_File__Output } from './ax/v1alpha1/File.js';
import type { GetModelRequest as _ax_v1alpha1_GetModelRequest, GetModelRequest__Output as _ax_v1alpha1_GetModelRequest__Output } from './ax/v1alpha1/GetModelRequest.js';
import type { GetTaskRequest as _ax_v1alpha1_GetTaskRequest, GetTaskRequest__Output as _ax_v1alpha1_GetTaskRequest__Output } from './ax/v1alpha1/GetTaskRequest.js';
import type { GetWorkspaceRequest as _ax_v1alpha1_GetWorkspaceRequest, GetWorkspaceRequest__Output as _ax_v1alpha1_GetWorkspaceRequest__Output } from './ax/v1alpha1/GetWorkspaceRequest.js';
import type { GitRepo as _ax_v1alpha1_GitRepo, GitRepo__Output as _ax_v1alpha1_GitRepo__Output } from './ax/v1alpha1/GitRepo.js';
import type { ListModelsRequest as _ax_v1alpha1_ListModelsRequest, ListModelsRequest__Output as _ax_v1alpha1_ListModelsRequest__Output } from './ax/v1alpha1/ListModelsRequest.js';
import type { ListModelsResponse as _ax_v1alpha1_ListModelsResponse, ListModelsResponse__Output as _ax_v1alpha1_ListModelsResponse__Output } from './ax/v1alpha1/ListModelsResponse.js';
import type { ListTasksRequest as _ax_v1alpha1_ListTasksRequest, ListTasksRequest__Output as _ax_v1alpha1_ListTasksRequest__Output } from './ax/v1alpha1/ListTasksRequest.js';
import type { ListTasksResponse as _ax_v1alpha1_ListTasksResponse, ListTasksResponse__Output as _ax_v1alpha1_ListTasksResponse__Output } from './ax/v1alpha1/ListTasksResponse.js';
import type { ListWorkspacesRequest as _ax_v1alpha1_ListWorkspacesRequest, ListWorkspacesRequest__Output as _ax_v1alpha1_ListWorkspacesRequest__Output } from './ax/v1alpha1/ListWorkspacesRequest.js';
import type { ListWorkspacesResponse as _ax_v1alpha1_ListWorkspacesResponse, ListWorkspacesResponse__Output as _ax_v1alpha1_ListWorkspacesResponse__Output } from './ax/v1alpha1/ListWorkspacesResponse.js';
import type { MCPConfig as _ax_v1alpha1_MCPConfig, MCPConfig__Output as _ax_v1alpha1_MCPConfig__Output } from './ax/v1alpha1/MCPConfig.js';
import type { MCPRegistry as _ax_v1alpha1_MCPRegistry, MCPRegistry__Output as _ax_v1alpha1_MCPRegistry__Output } from './ax/v1alpha1/MCPRegistry.js';
import type { MCPServer as _ax_v1alpha1_MCPServer, MCPServer__Output as _ax_v1alpha1_MCPServer__Output } from './ax/v1alpha1/MCPServer.js';
import type { Model as _ax_v1alpha1_Model, Model__Output as _ax_v1alpha1_Model__Output } from './ax/v1alpha1/Model.js';
import type { ModelSpec as _ax_v1alpha1_ModelSpec, ModelSpec__Output as _ax_v1alpha1_ModelSpec__Output } from './ax/v1alpha1/ModelSpec.js';
import type { ObjectMeta as _ax_v1alpha1_ObjectMeta, ObjectMeta__Output as _ax_v1alpha1_ObjectMeta__Output } from './ax/v1alpha1/ObjectMeta.js';
import type { PendingApproval as _ax_v1alpha1_PendingApproval, PendingApproval__Output as _ax_v1alpha1_PendingApproval__Output } from './ax/v1alpha1/PendingApproval.js';
import type { ResourceList as _ax_v1alpha1_ResourceList, ResourceList__Output as _ax_v1alpha1_ResourceList__Output } from './ax/v1alpha1/ResourceList.js';
import type { ResourceReqs as _ax_v1alpha1_ResourceReqs, ResourceReqs__Output as _ax_v1alpha1_ResourceReqs__Output } from './ax/v1alpha1/ResourceReqs.js';
import type { ResumeTaskRequest as _ax_v1alpha1_ResumeTaskRequest, ResumeTaskRequest__Output as _ax_v1alpha1_ResumeTaskRequest__Output } from './ax/v1alpha1/ResumeTaskRequest.js';
import type { SecretKeyRef as _ax_v1alpha1_SecretKeyRef, SecretKeyRef__Output as _ax_v1alpha1_SecretKeyRef__Output } from './ax/v1alpha1/SecretKeyRef.js';
import type { SkillRegistry as _ax_v1alpha1_SkillRegistry, SkillRegistry__Output as _ax_v1alpha1_SkillRegistry__Output } from './ax/v1alpha1/SkillRegistry.js';
import type { SkillsConfig as _ax_v1alpha1_SkillsConfig, SkillsConfig__Output as _ax_v1alpha1_SkillsConfig__Output } from './ax/v1alpha1/SkillsConfig.js';
import type { SuspendTaskRequest as _ax_v1alpha1_SuspendTaskRequest, SuspendTaskRequest__Output as _ax_v1alpha1_SuspendTaskRequest__Output } from './ax/v1alpha1/SuspendTaskRequest.js';
import type { Task as _ax_v1alpha1_Task, Task__Output as _ax_v1alpha1_Task__Output } from './ax/v1alpha1/Task.js';
import type { TaskSpec as _ax_v1alpha1_TaskSpec, TaskSpec__Output as _ax_v1alpha1_TaskSpec__Output } from './ax/v1alpha1/TaskSpec.js';
import type { TaskStatus as _ax_v1alpha1_TaskStatus, TaskStatus__Output as _ax_v1alpha1_TaskStatus__Output } from './ax/v1alpha1/TaskStatus.js';
import type { UpdateModelRequest as _ax_v1alpha1_UpdateModelRequest, UpdateModelRequest__Output as _ax_v1alpha1_UpdateModelRequest__Output } from './ax/v1alpha1/UpdateModelRequest.js';
import type { UpdateWorkspaceRequest as _ax_v1alpha1_UpdateWorkspaceRequest, UpdateWorkspaceRequest__Output as _ax_v1alpha1_UpdateWorkspaceRequest__Output } from './ax/v1alpha1/UpdateWorkspaceRequest.js';
import type { UsageStats as _ax_v1alpha1_UsageStats, UsageStats__Output as _ax_v1alpha1_UsageStats__Output } from './ax/v1alpha1/UsageStats.js';
import type { WatchTaskRequest as _ax_v1alpha1_WatchTaskRequest, WatchTaskRequest__Output as _ax_v1alpha1_WatchTaskRequest__Output } from './ax/v1alpha1/WatchTaskRequest.js';
import type { WatchTaskResponse as _ax_v1alpha1_WatchTaskResponse, WatchTaskResponse__Output as _ax_v1alpha1_WatchTaskResponse__Output } from './ax/v1alpha1/WatchTaskResponse.js';
import type { Workspace as _ax_v1alpha1_Workspace, Workspace__Output as _ax_v1alpha1_Workspace__Output } from './ax/v1alpha1/Workspace.js';
import type { WorkspaceRef as _ax_v1alpha1_WorkspaceRef, WorkspaceRef__Output as _ax_v1alpha1_WorkspaceRef__Output } from './ax/v1alpha1/WorkspaceRef.js';
import type { WorkspaceSpec as _ax_v1alpha1_WorkspaceSpec, WorkspaceSpec__Output as _ax_v1alpha1_WorkspaceSpec__Output } from './ax/v1alpha1/WorkspaceSpec.js';
import type { ListValue as _google_protobuf_ListValue, ListValue__Output as _google_protobuf_ListValue__Output } from './google/protobuf/ListValue.js';
import type { Struct as _google_protobuf_Struct, Struct__Output as _google_protobuf_Struct__Output } from './google/protobuf/Struct.js';
import type { Timestamp as _google_protobuf_Timestamp, Timestamp__Output as _google_protobuf_Timestamp__Output } from './google/protobuf/Timestamp.js';
import type { Value as _google_protobuf_Value, Value__Output as _google_protobuf_Value__Output } from './google/protobuf/Value.js';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  ax: {
    v1alpha1: {
      AX: SubtypeConstructor<typeof grpc.Client, _ax_v1alpha1_AXClient> & { service: _ax_v1alpha1_AXDefinition }
      Condition: MessageTypeDefinition<_ax_v1alpha1_Condition, _ax_v1alpha1_Condition__Output>
      CreateTaskRequest: MessageTypeDefinition<_ax_v1alpha1_CreateTaskRequest, _ax_v1alpha1_CreateTaskRequest__Output>
      DeleteModelRequest: MessageTypeDefinition<_ax_v1alpha1_DeleteModelRequest, _ax_v1alpha1_DeleteModelRequest__Output>
      DeleteModelResponse: MessageTypeDefinition<_ax_v1alpha1_DeleteModelResponse, _ax_v1alpha1_DeleteModelResponse__Output>
      DeleteTaskRequest: MessageTypeDefinition<_ax_v1alpha1_DeleteTaskRequest, _ax_v1alpha1_DeleteTaskRequest__Output>
      DeleteTaskResponse: MessageTypeDefinition<_ax_v1alpha1_DeleteTaskResponse, _ax_v1alpha1_DeleteTaskResponse__Output>
      DeleteWorkspaceRequest: MessageTypeDefinition<_ax_v1alpha1_DeleteWorkspaceRequest, _ax_v1alpha1_DeleteWorkspaceRequest__Output>
      DeleteWorkspaceResponse: MessageTypeDefinition<_ax_v1alpha1_DeleteWorkspaceResponse, _ax_v1alpha1_DeleteWorkspaceResponse__Output>
      EnvVar: MessageTypeDefinition<_ax_v1alpha1_EnvVar, _ax_v1alpha1_EnvVar__Output>
      File: MessageTypeDefinition<_ax_v1alpha1_File, _ax_v1alpha1_File__Output>
      GetModelRequest: MessageTypeDefinition<_ax_v1alpha1_GetModelRequest, _ax_v1alpha1_GetModelRequest__Output>
      GetTaskRequest: MessageTypeDefinition<_ax_v1alpha1_GetTaskRequest, _ax_v1alpha1_GetTaskRequest__Output>
      GetWorkspaceRequest: MessageTypeDefinition<_ax_v1alpha1_GetWorkspaceRequest, _ax_v1alpha1_GetWorkspaceRequest__Output>
      GitRepo: MessageTypeDefinition<_ax_v1alpha1_GitRepo, _ax_v1alpha1_GitRepo__Output>
      ListModelsRequest: MessageTypeDefinition<_ax_v1alpha1_ListModelsRequest, _ax_v1alpha1_ListModelsRequest__Output>
      ListModelsResponse: MessageTypeDefinition<_ax_v1alpha1_ListModelsResponse, _ax_v1alpha1_ListModelsResponse__Output>
      ListTasksRequest: MessageTypeDefinition<_ax_v1alpha1_ListTasksRequest, _ax_v1alpha1_ListTasksRequest__Output>
      ListTasksResponse: MessageTypeDefinition<_ax_v1alpha1_ListTasksResponse, _ax_v1alpha1_ListTasksResponse__Output>
      ListWorkspacesRequest: MessageTypeDefinition<_ax_v1alpha1_ListWorkspacesRequest, _ax_v1alpha1_ListWorkspacesRequest__Output>
      ListWorkspacesResponse: MessageTypeDefinition<_ax_v1alpha1_ListWorkspacesResponse, _ax_v1alpha1_ListWorkspacesResponse__Output>
      MCPConfig: MessageTypeDefinition<_ax_v1alpha1_MCPConfig, _ax_v1alpha1_MCPConfig__Output>
      MCPRegistry: MessageTypeDefinition<_ax_v1alpha1_MCPRegistry, _ax_v1alpha1_MCPRegistry__Output>
      MCPServer: MessageTypeDefinition<_ax_v1alpha1_MCPServer, _ax_v1alpha1_MCPServer__Output>
      Model: MessageTypeDefinition<_ax_v1alpha1_Model, _ax_v1alpha1_Model__Output>
      ModelSpec: MessageTypeDefinition<_ax_v1alpha1_ModelSpec, _ax_v1alpha1_ModelSpec__Output>
      ObjectMeta: MessageTypeDefinition<_ax_v1alpha1_ObjectMeta, _ax_v1alpha1_ObjectMeta__Output>
      PendingApproval: MessageTypeDefinition<_ax_v1alpha1_PendingApproval, _ax_v1alpha1_PendingApproval__Output>
      ResourceList: MessageTypeDefinition<_ax_v1alpha1_ResourceList, _ax_v1alpha1_ResourceList__Output>
      ResourceReqs: MessageTypeDefinition<_ax_v1alpha1_ResourceReqs, _ax_v1alpha1_ResourceReqs__Output>
      ResumeTaskRequest: MessageTypeDefinition<_ax_v1alpha1_ResumeTaskRequest, _ax_v1alpha1_ResumeTaskRequest__Output>
      SecretKeyRef: MessageTypeDefinition<_ax_v1alpha1_SecretKeyRef, _ax_v1alpha1_SecretKeyRef__Output>
      SkillRegistry: MessageTypeDefinition<_ax_v1alpha1_SkillRegistry, _ax_v1alpha1_SkillRegistry__Output>
      SkillsConfig: MessageTypeDefinition<_ax_v1alpha1_SkillsConfig, _ax_v1alpha1_SkillsConfig__Output>
      SuspendTaskRequest: MessageTypeDefinition<_ax_v1alpha1_SuspendTaskRequest, _ax_v1alpha1_SuspendTaskRequest__Output>
      Task: MessageTypeDefinition<_ax_v1alpha1_Task, _ax_v1alpha1_Task__Output>
      TaskSpec: MessageTypeDefinition<_ax_v1alpha1_TaskSpec, _ax_v1alpha1_TaskSpec__Output>
      TaskStatus: MessageTypeDefinition<_ax_v1alpha1_TaskStatus, _ax_v1alpha1_TaskStatus__Output>
      UpdateModelRequest: MessageTypeDefinition<_ax_v1alpha1_UpdateModelRequest, _ax_v1alpha1_UpdateModelRequest__Output>
      UpdateWorkspaceRequest: MessageTypeDefinition<_ax_v1alpha1_UpdateWorkspaceRequest, _ax_v1alpha1_UpdateWorkspaceRequest__Output>
      UsageStats: MessageTypeDefinition<_ax_v1alpha1_UsageStats, _ax_v1alpha1_UsageStats__Output>
      WatchTaskRequest: MessageTypeDefinition<_ax_v1alpha1_WatchTaskRequest, _ax_v1alpha1_WatchTaskRequest__Output>
      WatchTaskResponse: MessageTypeDefinition<_ax_v1alpha1_WatchTaskResponse, _ax_v1alpha1_WatchTaskResponse__Output>
      Workspace: MessageTypeDefinition<_ax_v1alpha1_Workspace, _ax_v1alpha1_Workspace__Output>
      WorkspaceRef: MessageTypeDefinition<_ax_v1alpha1_WorkspaceRef, _ax_v1alpha1_WorkspaceRef__Output>
      WorkspaceSpec: MessageTypeDefinition<_ax_v1alpha1_WorkspaceSpec, _ax_v1alpha1_WorkspaceSpec__Output>
    }
  }
  google: {
    protobuf: {
      ListValue: MessageTypeDefinition<_google_protobuf_ListValue, _google_protobuf_ListValue__Output>
      NullValue: EnumTypeDefinition
      Struct: MessageTypeDefinition<_google_protobuf_Struct, _google_protobuf_Struct__Output>
      Timestamp: MessageTypeDefinition<_google_protobuf_Timestamp, _google_protobuf_Timestamp__Output>
      Value: MessageTypeDefinition<_google_protobuf_Value, _google_protobuf_Value__Output>
    }
  }
}

