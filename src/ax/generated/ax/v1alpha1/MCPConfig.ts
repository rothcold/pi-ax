// Original file: proto/ax/v1alpha1/ax.proto

import type { MCPRegistry as _ax_v1alpha1_MCPRegistry, MCPRegistry__Output as _ax_v1alpha1_MCPRegistry__Output } from '../../ax/v1alpha1/MCPRegistry.js';
import type { MCPServer as _ax_v1alpha1_MCPServer, MCPServer__Output as _ax_v1alpha1_MCPServer__Output } from '../../ax/v1alpha1/MCPServer.js';

export interface MCPConfig {
  'registries'?: (_ax_v1alpha1_MCPRegistry)[];
  'servers'?: (_ax_v1alpha1_MCPServer)[];
}

export interface MCPConfig__Output {
  'registries': (_ax_v1alpha1_MCPRegistry__Output)[];
  'servers': (_ax_v1alpha1_MCPServer__Output)[];
}
