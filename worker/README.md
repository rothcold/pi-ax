# One-shot AX worker and workspace protocol

This is the worker image/wrapper, **not** a standalone Docker replacement for AX. AX creates and initially activates a real task with `debug: true`, an empty task command/env/workspace list, and this image. The unmodified AX task runner is PID 1 and serves the routed guest APIs. The host then uploads two files and uses guest `StartProcess` once. No Pi RPC, task retry, conversation resumption, automatic patch application, commit, or push is performed.

## Build

From the repository root, with a Linux C compiler (`cc`) for local builds/tests:

```sh
npm ci
npm run check
npm run build:worker
npm run build:image
```

The Dockerfile builds AX commit `ac2332829f22360ff97b0ba34d94dd0dd782f17e` from a checksum-verified official source archive. It installs Node 24.13.0, the Pi release resolved from npm `latest` for this build, Git and SQLite CLI. Its only entrypoint is `/usr/local/bin/ax-task-runner`. The Docker context is allowlisted in `.dockerignore`. See [provenance](PROVENANCE.md). Build/use the resulting immutable image digest during real AX acceptance. Fixture tests do not validate the image or AX runtime. See [actual integration evidence](../docs/v1-validation.md) for the image build and deployment attempt.

Each supported `npm run build:image` performs a fresh `npm view @earendil-works/pi-coding-agent dist-tags.latest --json` lookup with a temporary empty cache. Registry errors or invalid versions stop the build. The resolved version is passed as `PI_VERSION`, invalidating the Pi install layer when latest changes; an unchanged version can reuse that layer. Raw Docker builds without the argument fail instead of silently using an old default. Use the script, not a manually saved argument, for upgrades.

The worker manifest uses `latest` and has no project lockfile. The root `npm-shrinkwrap.json` still locks build/test tooling, including its separate Pi development dependency. Do not run `npm ci --prefix worker`; local tests use root dependencies. The image installs the exact per-build resolution with `--no-save --package-lock=false` in a fresh `/opt/pi`; this is a build snapshot, not a repository version pin. Pi's own published dependency shrinkwrap remains upstream-owned and is not patched.

The build verifies the installed version and saves it in `/opt/pi/pi-version`, prints it in the build log, and labels the image `org.pi-ax.pi.version`. Save the build log and inspect the version without a model call:

```sh
docker image inspect pi-ax-worker:local --format '{{ index .Config.Labels "org.pi-ax.pi.version" }}'
docker run --rm --network none --entrypoint /opt/pi/node_modules/.bin/pi pi-ax-worker:local --version
```

Rebuild and deploy/select the new immutable image digest to upgrade existing images. Running tasks never upgrade Pi automatically, and the host Pi installation is untouched. Future latest releases are not guaranteed compatible; repeat runtime acceptance after upgrades. Historical Pi 0.99.2 builds/audits remain recorded in the validation document, including their inherited high `brace-expansion` advisory. The unchanged root tooling tree still uses 0.99.2; do not infer the floating image's audit status from it.

## Host imports and upload contract

`src/workspace.ts` exports:

- `createSnapshot(directory): Promise<SnapshotPayload>`; payload is UTF-8 JSON, with `snapshot`, `payload: Buffer`, and `sha256` of the exact upload bytes.
- `decodeSnapshot(payload, expectedHash?)`, `encodeSnapshot(snapshot)`.
- `materializeSnapshot(snapshot, destination)`; destination must not exist.
- `createPatch(baseline, result): Promise<Buffer>`; a Git binary patch, generated with independent disposable Git objects/index and **no commits**.
- `WorkspaceSnapshot`, `SnapshotFile`, `SnapshotPayload`, `SNAPSHOT_LIMITS`, `isExcludedPath`, `validateWorkspacePath`, `sha256`.

Snapshot schema:

```ts
interface WorkspaceSnapshot {
  version: 1;
  files: {
    path: string;                 // safe root-relative POSIX path
    mode: 420 | 493 | 40960;      // 0644, 0755, 0120000 symlink
    data: string;                 // canonical base64 bytes, or UTF-8 link target
    sha256: string;               // lowercase hex SHA-256 of decoded bytes
  }[];
}
```

Snapshots use current disk contents, including uncommitted/new/gitignored source, not HEAD/index. They are deterministic for unchanged bytes and executable bits. Host `.git` is never read. Empty directories, ownership, non-executable permission distinctions, xattrs and special files are not represented. All `.env*` (including examples), common credential files, `.pi`, `.pi-ax`, `.config`, `.ssh`/cloud credentials, dependencies/caches/build outputs and `*.log` are excluded at every path component. Full name rules live in `isExcludedPath`. This is conservative name filtering, **not secret detection**; arbitrary source files can still contain secrets. There is no gitignore interpretation, so an untracked/ignored source file is not accidentally dropped.

Safe internal symlinks are preserved. Outward, dangling, cyclic or excluded-target symlinks cause snapshot rejection rather than following/uploading them. Directory traversal, invalid paths, prefix conflicts, noncanonical base64 and incorrect hashes are rejected. Source file opens use `O_NOFOLLOW` and inode/change checks; prepare a quiescent local tree, not an adversarial concurrently rewritten directory hierarchy. Receiver extraction requires a fresh directory and never invokes an archive extractor. Limits: 10,000 files, 8 MiB/file, 32 MiB total raw bytes, 48 MiB payload; traversal also bounds encountered entries at 40,000.

`src/worker-protocol.ts` exports `WorkerRequest`, `WorkerStarted`, `WorkerResult`, `WorkerArtifact`, `ArtifactName`, `workerPaths(root?)`, `parseWorkerRequest`, `parseWorkerResult`, `WorkerTermination`, `parseWorkerTermination`, and all transfer limits/names. `workerPaths()` defaults to `/workspace`:

| Path | Purpose |
| --- | --- |
| `/workspace/pi-ax-snapshot.json` | exact `SnapshotPayload.payload` upload |
| `/workspace/pi-ax-request.json` | UTF-8 JSON request, maximum 1 MiB |
| `/workspace/repo` | materialized task working tree |
| `/workspace/.pi-ax/started.json` | exclusive one-shot claim evidence |
| `/workspace/.pi-ax/result.json` | final result manifest, maximum 1 MiB |
| `/workspace/.pi-ax/termination.json` | correlated owned-descendant termination proof, maximum 4 KiB |
| `/workspace/.pi-ax/changes.patch` | complete Git binary patch when available |
| `/workspace/.pi-ax/events.jsonl` | bounded, redacted Pi JSON events |
| `/workspace/.pi-ax/stderr.log` | bounded, redacted Pi stderr |

Request:

```ts
interface WorkerRequest {
  version: 1;
  taskId: string;                 // host task correlation label
  prompt: string;                 // max 256 KiB; never put credentials here
  provider: string;               // explicit provider
  model: string;                  // explicit Pi model ID/pattern
  credentialEnv: string[];        // names only, host allowlist validation reused
  snapshotSha256: string;         // exact snapshot upload hash
}
```

Upload both files using guest `WriteFile` mode 0600. Then exactly:

```ts
transport.startProcess(ref, {
  command: WORKER_COMMAND, // ['node', '/opt/pi-ax/dist/worker/run.js']
  cwd: '/workspace',
  env: readCredentialEnv(config), // only configured values, never persist
  timeoutSeconds: 900,
});
```

Do not put credentials in task metadata, argv, prompt or files. The wrapper reconstructs Pi's environment from allowlisted values plus fixed runtime variables; it does not pass the runner's environment wholesale. Pi gets a fresh private HOME/agent directory, `--print --mode json --no-session --no-extensions --no-skills --no-prompt-templates --no-themes --no-approve`, explicit tools/provider/model, and the prompt over stdin. No host auth files are read/copied. Project `AGENTS.md` still provides task instructions. Agent/provider retries, compaction recovery, cache warming, telemetry and background version/model refreshes are disabled. `PI_OFFLINE=1` disables automatic activity, **not** the explicitly requested provider call. Resource flags/settings were verified against installed Pi docs/types and 0.99.2 CLI help.

The wrapper creates `.pi-ax` exclusively before execution and never retries an existing claim. A lost StartProcess reply must **not** cause another StartProcess. A marker supports correlation but is not an authoritative running/exited process query. Process IDs and unknown-state reconciliation belong to the lifecycle manager.

## Results and cleanup

```ts
interface WorkerResult extends WorkerStarted {
  // WorkerStarted = { version: 1, taskId, snapshotSha256, startedAt: ISO string }
  finishedAt: string;
  outcome: 'completed' | 'failed' | 'incomplete';
  piExitCode: number | null;
  piSignal: string | null;
  agentSettled: boolean;
  finalStopReason: string | null;
  finalText: string;              // redacted, bounded summary
  logsTruncated: boolean;
  patchComplete: boolean;
  issues: string[];              // controlled diagnostic categories
  artifacts: { name: 'changes.patch' | 'events.jsonl' | 'stderr.log'; bytes: number; sha256: string }[];
}
```

Success requires exit 0, a final assistant `stop`, `agent_settled`, no protocol/error issues, and complete patch generation. JSON mode can exit zero after an assistant error; this is classified **failed**. Missing completion, length limit, malformed/oversized event records or unexpected retries are **incomplete**. Tool events preserve actual command arguments/results/`isError`; the wrapper does not claim a task's tests passed just because Pi finished.

Each log is capped at 4 MiB; events continue to be decoded after the persisted-log cap and `logsTruncated` reports loss. Records above 1 MiB are dropped and mark output incomplete. Invalid JSON records are preserved as redacted `wrapper_invalid_event` diagnostic records. Valid JSON string values and stderr are exact-value redacted, including credential values split across chunks/newlines. Final assistant text is bounded to 64 Ki characters. Patch bytes are **not redacted or rewritten**: they must remain applicable, may be binary, and are untrusted output. There is no secrecy guarantee against a malicious worker that encodes/transforms credentials or embeds them in source/patches.

The final patch includes new and deleted files, binary changes, executable modes and internal symlinks relative to the uploaded working-tree baseline. Gitignore and attributes/line ending filters cannot hide new files or rewrite source bytes because blobs are hashed with `--no-filters`. The same exclusions/limits apply to final files. Unsafe final files make `patchComplete=false`; no partial patch is presented as complete. Patch export limit is 64 MiB.

The inspected Pi bash implementation deliberately starts detached process groups, so wrapper-group SIGKILL alone is **not** whole-job termination. The wrapper launches a small Linux native subreaper (`worker/supervise.c`) in its own session. It handles TERM/INT, an 890-second Pi budget (reserving time before the unchanged 900-second guest watchdog), and parent death via `PR_SET_PDEATHSIG` with a parent-ID race check. It sends TERM to owned children, escalates after one second to KILL, reaps them and any adopted detached descendants, and only writes `termination.json` after `waitpid` confirms no children remain. It never enumerates/kills other process trees. No retry or fallback execution occurs if the helper is unavailable/unsupported. An unkillable child or missing proof remains unconfirmed; this is ordinary worker supervision, **not hostile-process containment**.

`WorkerTermination` is `{version:1, taskId, snapshotSha256, finishedAt, piExitCode:number|null, piSignal:number|null, interrupted:boolean}`; exit/signal describe the actual Pi child, not the guard. Pure pre-launch setup failure writes equivalent no-child evidence. The wrapper reads this proof before producing an outcome. Wrapper SIGKILL may prevent final patch/manifest while the independent guard still reaps descendants and writes proof. The manager needs **both** observed wrapper exit and correlated termination proof to release the reservation or confirm cancellation; a manifest alone is insufficient. Absent proof keeps state `unknown` even when `processState` is `exited`. Never infer timeout/cancellation solely from 137.

The manager must validate result schema, task ID and snapshot hash, then fetch only allowlisted artifact paths and verify every length/SHA-256. Archive atomically and durably on the host **before** deletion. Do not delete on export failure. If no manifest exists, explicitly archive available partial files and known/unknown execution state; never invent a complete result or rerun Pi to recover it. No output is applied or pushed automatically.

## Validation boundary

`tests/workspace.test.ts` uses actual local disk/Git snapshot/patch/apply round trips. `tests/worker.test.ts` executes the actual wrapper with controlled subprocess fixtures (including error events, nonzero exits, absent/malformed completion, truncation, env isolation, redaction and TERM/KILL). Additional regressions run the actual root-tooling Pi bash implementation (currently 0.99.2, with its installed version reported in test diagnostics), including detached long-lived descendants, wrapper TERM, guest-style group SIGKILL, shortened guard deadline and normal Pi exit with background work. They verify all owned PIDs are gone and an unrelated process survives. **These tests are not Pi model execution or real AX E2E.** The original Pi 0.99.2 package's version/help were checked with an empty environment and isolated temporary HOME; no credential was inspected.

Real acceptance remains a full one-shot Pi inside AX/gVisor performing SQLite CREATE/INSERT/SELECT/UPDATE/DELETE, with actual source/database/test evidence, image/runtime proof and export/restart management. Missing explicitly configured model credentials must be reported; host Pi login credentials must never be copied. Upstream AX authentication/network/resource shortcomings remain documented limitations, not new worker engineering deliverables.
