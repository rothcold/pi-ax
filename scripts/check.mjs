import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { buildSupervisor } from './build-worker.mjs';

const tests = readdirSync('tests', { recursive: true }).filter((p) => p.endsWith('.test.ts')).map((p) => `tests/${p}`);
const checks = {
  lint: ['node_modules/eslint/bin/eslint.js', '.'],
  typecheck: ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json'],
  test: ['--import', 'tsx', '--test', ...tests],
};
const selected = process.argv[2] ? [process.argv[2]] : Object.keys(checks);
for (const check of selected) {
  if (!checks[check]) throw new Error(`Unknown check: ${check}`);
  if (check === 'test') buildSupervisor();
  const result = spawnSync(process.execPath, checks[check], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
