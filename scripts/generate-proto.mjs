import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const result = spawnSync(process.execPath, [
  'node_modules/@grpc/proto-loader/build/bin/proto-loader-gen-types.js',
  '--grpcLib=@grpc/grpc-js', '--longs=String', '--enums=String', '--defaults', '--oneofs',
  '--outDir=src/ax/generated', 'proto/ax/v1alpha1/ax.proto', 'proto/ateenv/v1alpha/guest.proto', 'proto/ateapi/ateapi.proto',
], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
// Generator emits extensionless imports; NodeNext needs .js type specifiers.
for (const path of readdirSync('src/ax/generated', { recursive: true }).filter((p) => p.endsWith('.ts'))) {
  const file = `src/ax/generated/${path}`;
  writeFileSync(file, readFileSync(file, 'utf8').replace(/from '([^']+)'/g, (_, specifier) =>
    `from '${specifier.startsWith('.') ? `${specifier}.js` : specifier}'`));
}
