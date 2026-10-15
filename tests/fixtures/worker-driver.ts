// Test-only subprocess driver: production CLI accepts no root/executable override.
import { runWorker } from '../../worker/run.js';
import { fileURLToPath } from 'node:url';
const result = await runWorker({ root: process.argv[2], supervisorExecutable: fileURLToPath(new URL('../../dist/worker/supervise', import.meta.url)), supervisionMs: process.argv[4] ? Number(process.argv[4]) : undefined, executable: process.execPath, executableArgs: [process.argv[3]], environment: { FIXTURE_TOKEN: 'fixture-token' } });
process.exitCode = result.outcome === 'completed' ? 0 : 1;
