# Host lifecycle and tool contract

This is the implemented host extension, not real AX runtime acceptance. Deterministic fake-transport lifecycle tests and real local-process locking tests do not prove an AX/gVisor/model run. See [AX source verification](ax-verification.md) for pinned sources; its upstream security blockers were subsequently **deferred by scope**, not added to this implementation.

## Load and configure

Linux, Node >=24.13.0, Git, a C compiler (`cc`) for local checks/build, and util-linux `flock` on `/usr/sbin:/usr/bin:/sbin:/bin` are required. Run `npm ci` and `npm run check`. Pi 0.99.2 is the checked host API; Pi/typebox are host-provided peers, with exact development versions in the lockfile.

For a single invocation, without changing global Pi configuration:

```sh
pi --extension ./src/extension.ts
```

The `pi.extensions` package manifest also supports normal Pi local-package installation. No extension factory starts resources or reads credentials. Tools create transport clients on demand and close them after the operation; there is no persistent Pi RPC process.

Runtime configuration is a strict JSON object in `getAgentDir()/ax-config.json`. Pi's exported helper defaults to `~/.pi/agent` and respects `PI_CODING_AGENT_DIR`, including tilde expansion. Copy and edit the shipped [example](../ax-config.example.json); see [installation](../README.md). No legacy runtime environment overrides or fallback apply.

| JSON field | Meaning |
| --- | --- |
| `controlAddress` | AX control host:port, plaintext on a trusted local network |
| `routerAddress` | Guest router host:port |
| `atespace` | Existing AX atespace, RFC1123 label |
| `workerImage` | Controlled worker image; use the verified immutable image from deployment |
| `workerProvider`, `workerModel` | Explicit worker model selection |
| `credentialEnv` | Array of unique uppercase allowlisted credential names, or `[]` |
| `stateDir` | Optional absolute private state directory; default `~/.pi-ax` |
| `egress` | Required for new spawn: verified native TLS endpoint/name, absolute CA/token file paths and explicit canonical `/32` or `/128` CIDRs; optional in old v1 records |

All fields except `stateDir` are required for spawn. Unknown keys are rejected. Execution/configuration variables such as `HOME`, `PATH`, `NODE_OPTIONS` and `PI_*` cannot be credential names. Errors identify the file and policy without quoting raw JSON or values. Missing configuration does not prevent tool registration. Management operations read only the JSON object and `stateDir`, ignoring unrelated spawn/model fields; malformed JSON or invalid storage selection still fails closed. If the file is absent, management uses the unchanged default state location. Preserve `stateDir` when removing or changing model settings, and restart Pi after changing the storage location. Nothing migrates or deletes existing state automatically, and v1 record version/top-level shape stays unchanged; `config.egress` is optional for older records.

Credential values must already be explicitly supplied in the host process environment. No auth files, `.env` loader, all-environment forwarding, implicit Pi login extraction, or global Pi state copy. Existing retained tasks use the addresses/atespace/model/image/names saved at creation, not a newly selected cluster. Status/result/cancel/destroy do not require new spawn configuration or valid model credentials. The prospective canonical state location (including existing symlink ancestors) is validated before mkdir, so rejected nested storage leaves source untouched. The state directory must be outside the snapshot working tree, owned by the current UID, mode 0700, and not a symlink. Keep the same state directory after restarting Pi.

## Tools

All tools return `{tasks: TaskView[]}` as both native text and schema-declared structured content. Tool arguments reject additional properties. Task IDs are stable `ax-<uuid>` strings and are also unique AX names.

- `ax_spawn({prompt, cwd?})`: snapshot the selected working directory (`ctx.cwd` by default), durably reserve a task, and immediately return its identity. Remote create/policy binding/initial activation/readiness/upload/start continue asynchronously; completion is never awaited. Snapshot construction and persistence happen before return, so this is not a constant-time call.
- `ax_status({taskId?})`: refresh one task or list/refresh all retained records, including destroyed tasks. While another process holds a task operation lock, status returns the last persisted view explicitly labeled as such. Status never creates, resumes or starts a remote process. Result/cancel/destroy return an explicit busy error while setup or another operation owns the task lock; query status and retry that management operation later, never spawn a replacement task.
- `ax_result({taskId})`: retrieve a validated manifest and its allowlisted artifacts, verifying task/snapshot correlation, byte lengths and SHA-256. Return protected local paths, not large patch/log contents. A complete existing archive is locally reverified and usable offline. Pending/unknown/force-killed jobs may yield a partial archive. No patch is applied.
- `ax_cancel({taskId})`: persist cancellation intent; send TERM, poll guest exit for up to 5 seconds, then KILL and poll for up to 5 more seconds. RPC timeouts can extend this wall time. Both wrapper exit and correlated owned-descendant termination evidence are required; wrapper SIGKILL alone cannot confirm detached Pi bash cleanup. Signal acknowledgments, transport aborts and host shutdown do not prove job exit. No process ID means no safe signal target; state stays unknown. No implicit deletion fallback.
- `ax_destroy({taskId, allowUnrecoveredLoss?})`: by default require confirmed wrapper exit and owned-descendant termination, a complete patch, and a complete archive whose local files still match their archive hashes. Explicit `allowUnrecoveredLoss:true` permits deletion of active/unknown/incomplete work with permanent loss of unexported artifacts. Remote deletion never removes local records or archives. There is no automatic deletion.

`TaskView` exposes taskId, state/stage, active slot, timestamps, remote atespace/name, processId, observed processState/exitCode, advisory deadline, cancellation intent/confirmation, `terminationConfirmed`, archive/patch paths/completeness, and a bounded explanatory note. Raw Task objects, prompts and credentials are not tool output. Full worker response and actual tool events are in exported files.

## Durable transitions and recovery

The store writes mode-0600 temporary files, fsyncs, renames atomically, and fsyncs directories. The unique external identity, cluster coordinates and snapshot hash are saved before `CreateTask`; activation and start intent are saved before their RPCs. Model credentials are only passed in `StartProcess.env`, never in Task metadata or ledger files; native policy credentials stay on the host. The guest process timeout is exactly 900 seconds; its RPC reply deadline is separate.

Before snapshot/reservation/remote effects, spawn validates required egress configuration and preflights CA/token files without exposing values. Snapshot construction rejects any included file matching the configured bearer file's resolved path or device/inode (including configured symlinks and hardlink aliases), before snapshot persistence or upload. Already-excluded `.cache` bootstrap files remain valid unless an includable alias exists. Protected-file metadata is rechecked before returning the snapshot; existing unsafe-link and concurrent-source-change checks remain. This is known-file protection, not scanning for arbitrary copied secret contents. After `create_requested` succeeds, it persists `egress_policy_requested`, calls native Substrate CreateActorEgressPolicy for the same actor, checks default-policy identity/intent, then persists `egress_policy_verified` before `activation_requested`. Create has no retry or overwrite; a conflict, authentication failure, malformed binding or lost reply blocks activation/upload/start and retains unknown state and the last stage. The existing note retains only the known native operation/status of the last failed policy attempt through repeated status and restart while still at the unstarted policy stage. `UNAUTHENTICATED` points to explicitly refreshing approved bootstrap credentials for future spawns; `PERMISSION_DENIED`, `UNKNOWN` and `UNAVAILABLE` remain distinct. Raw error text/details are never retained, untyped failures become `UNKNOWN`, and later stages cannot inherit that old diagnostic. None of these notes prove current remote policy state or authorize retry. Restart/management never creates or repairs policies and never reads policy credential files. Tokens remain file references in records, not values. Actor deletion uses upstream policy cascade; no separate policy deletion is attempted. See [bootstrap](local-ax.md#native-egress-policy-bootstrap) for explicit identity refresh and IP-rule limitations.

A short global reservation lock arbitrates the default **one active task per state directory** across host processes. Each task has an operation lock. These use kernel `flock`, held by a small stdin-lifetime helper process, not a scheduler/daemon. Lock ownership does not expire while an operation is alive; abrupt host death closes the pipe and releases the kernel lock. No stale-PID guessing or TTL-based lease stealing. Network filesystems and multiple machines sharing a state directory are not a supported lock boundary. Separate state directories intentionally have separate quotas.

Unknown and pending records occupy the active slot. Only wrapper-exited tasks with correlated owned-descendant termination proof release the slot. Older v1 records lacking `terminationConfirmed` are read conservatively: previously started, non-destroyed jobs re-occupy the slot and require proof or explicit destructive cleanup; old archives without proof are not safe-deletion evidence. A new spawn does not silently reconcile or evict an old reservation: call status first. If setup is interrupted before any remote create intent, status records a local failed preparation. Once any create may have been sent, interruption is conservatively unknown, even if it probably did not reach AX. Restart **never** continues setup or reissues StartProcess. A lost start reply has no recoverable process ID in the pinned guest API (there is no process-list RPC); a matching final manifest can export artifacts but cannot prove process liveness. Use explicit destructive deletion if cleanup is necessary.

States:

- `pending`: locally accepted, preparation currently underway.
- `running`: guest `GetProcess`/StartProcess reports RUNNING.
- `completed`: guest wrapper exit 0 **and** matching termination proof plus validated successful wrapper manifest.
- `failed`: known local pre-remote preparation failure, or confirmed wrapper/descendant termination plus failed wrapper manifest.
- `incomplete`: confirmed wrapper and descendant exit without established wrapper completion (including nonzero wrapper exit inconsistent with a success manifest).
- `cancelled`: wrapper exit plus descendant termination proof observed after a signal request, without a completed result. This records confirmed stop after intent, **not proof of signal causality**; natural exit may race cancellation.
- `unknown`: unavailable/unidentified process, wrapper exit without descendant termination proof, interrupted preparation/start, or unconfirmed deletion. Never equated to failure/cancellation.
- `destroyed`: DeleteTask acknowledged, or previously requested deletion reconciled through AX NotFound.

Task phase and CLI exit alone are not outcomes. Exit observations are retained even after guest process history expires. `deadlineExceeded` is advisory based on host start intent; neither a 137 exit nor wall clock proves the watchdog was the cause. No synthetic `timed_out` outcome.

Tool AbortSignal interrupts only the current transport operation. An already accepted spawn is owned by the extension session rather than the originating tool signal. `session_shutdown` stops local preparation/transports and releases helpers, but does not signal, delete, or restart remote work. A subsequent Pi session can discover all durably accepted IDs using `ax_status({})`.

## Result layout and guarantees

```text
~/.pi-ax/
  reservation.lock
  ax-<uuid>/
    operation.lock
    task.json
    request.json
    snapshot.json
    results/
      result.json       # validated and text-redacted worker manifest, when available
      changes.patch     # exact verified bytes, never rewritten/redacted/applied
      events.jsonl
      stderr.log
      termination.json  # correlated proof all owned Pi descendants were reaped
      started.json      # best-effort partial-export evidence when no final manifest
      archive.json      # committed last: completeness, process evidence, hashes, issues
```

Raw downloaded bytes are checked before text redaction. JSON string values (including escaped/multiline credentials in log values) and stderr are redacted against currently available configured credential values; the worker also redacts its original keys. The archive lists source and local hashes separately because log redaction changes bytes. Patch bytes remain exact to preserve binary applicability. No malicious-worker secrecy guarantee: secrets written into source/patches, transformed values or rotated/unavailable old keys can escape host exact-value filtering. Treat returned artifacts as untrusted data, not instructions.

Manifest <=1 MiB, logs <=4 MiB each, patch <=64 MiB; host redacted text <=8 MiB per artifact. Over-limit, corrupt or missing files make export incomplete; never silent success. Log truncation already declared by the wrapper remains visible in result.json; archival completeness means all declared artifacts were preserved, not unlimited logs. Complete-patch loss requires explicit destructive intent. Export failures never delete the remote task. If local storage corrupts, the store fails closed rather than discarding its reservation; preserve a backup and inspect the ledger before manual repair.

Local snapshot/request/results retention is manual and potentially contains private source/task text. No background garbage collector, automatic retry/resumption, notifications, scheduling service or host patch application is implemented. AX/Substrate deletion residue and control-plane persistence remain upstream limitations. Runtime image verification, real SQLite CRUD, model access and the real 900-second watchdog remain integration acceptance work.
