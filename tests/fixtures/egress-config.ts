import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { EgressConfig } from '../../src/config.js';

/** Isolated synthetic credentials for lifecycle preflight, never a live identity. */
export function egressFixture(root: string): EgressConfig {
  const caFile = path.join(root, 'test-ca.pem');
  const bearerTokenFile = path.join(root, 'test-token');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=api.ate-system.svc', '-keyout', path.join(root, 'test-key.pem'), '-out', caFile], { stdio: 'ignore' });
  writeFileSync(bearerTokenFile, 'synthetic-policy-sentinel\n', { mode: 0o600 });
  return { address: 'localhost:1236', serverName: 'api.ate-system.svc', caFile, bearerTokenFile, cidrs: ['192.0.2.97/32'] };
}
