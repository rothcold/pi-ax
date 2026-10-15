import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
function run(command, args) {
  const child = spawnSync(command, args, { stdio: 'inherit' });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Worker build failed: ${command}`);
}
export function buildSupervisor() {
  mkdirSync('dist/worker', { recursive: true });
  run('cc', ['-D_GNU_SOURCE', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-o', 'dist/worker/supervise', 'worker/supervise.c']);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildSupervisor();
  run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'worker/tsconfig.json']);
}
