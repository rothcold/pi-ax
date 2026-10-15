// Original file: proto/ax/v1alpha1/ax.proto

import type { MCPServer as _ax_v1alpha1_MCPServer, MCPServer__Output as _ax_v1alpha1_MCPServer__Output } from '../../ax/v1alpha1/MCPServer.js';

export interface MCPRegistry {
  'provider'?: (string);
  'project'?: (string);
  'query'?: (string);
  'servers'?: (_ax_v1alpha1_MCPServer)[];
}

export interface MCPRegistry__Output {
  'provider': (string);
  'project': (string);
  'query': (string);
  'servers': (_ax_v1alpha1_MCPServer__Output)[];
}
