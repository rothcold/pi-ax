import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const lock of ['npm-shrinkwrap.json', 'package-lock.json']) {
  if (existsSync(path.join(root, 'worker', lock))) throw new Error(`Remove worker/${lock}: worker Pi must resolve latest at build time`);
}
function run(command, args, stdio) {
  const child = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${command} failed (${child.status ?? child.signal}); image build stopped`);
  return child.stdout;
}

// A fresh cache prevents npm's stale-on-registry-error fallback from selecting an old tag.
const cache = mkdtempSync(path.join(tmpdir(), 'pi-ax-npm-latest-'));
let version;
try {
  version = JSON.parse(run('npm', ['view', '@earendil-works/pi-coding-agent', 'dist-tags.latest', '--json', '--prefer-online', '--offline=false', '--cache', cache], ['ignore', 'pipe', 'inherit']));
} finally { rmSync(cache, { recursive: true, force: true }); }
const numeric = '(0|[1-9][0-9]*)';
const prerelease = '(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const semver = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
if (typeof version !== 'string' || version.length > 256 || version !== version.trim() || !semver.test(version)) throw new Error('npm latest did not resolve to an exact Pi version; image build stopped');
console.log(`Worker Pi resolved from npm latest: ${version}`);
run('docker', ['build', '--progress=plain', '-f', 'worker/Dockerfile', '--build-arg', `PI_VERSION=${version}`, '-t', 'pi-ax-worker:local', '.'], 'inherit');
console.log(`Built pi-ax-worker:local with Pi ${version}; inspect label org.pi-ax.pi.version and /opt/pi/pi-version. Rebuild to upgrade.`);
