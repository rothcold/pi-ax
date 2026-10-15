# pi-ax

A standalone Pi extension: host Pi starts a **full, one-shot Pi worker in Google AX**, then retrieves its actual patch, logs and execution state. Not a pi-subagents backend or a long-lived Pi RPC session.

Installing this extension **does not provision AX or provide a hosted sandbox**. You operate the AX services and worker image; Pi orchestrates tasks and exports results for review.

## Prerequisites

- Linux, Node >=24.13.0, Git, util-linux `flock`, and a host [Pi](https://github.com/earendil-works/pi) installation. Root tooling is tested with Pi **0.99.2**; wildcard host peers follow Pi's package contract, not a guarantee of every host version.
- A real AX control plane/router and an independently runtime-verified, registry-qualified immutable [worker image](worker/README.md). For a development cluster, follow [local AX provisioning](docs/local-ax.md); extension installation alone is insufficient.
- A TLS-verified native Substrate identity (CA, server authority and bearer file), the existing egress gateway enabled, and explicitly chosen destination IPv4 `/32` or canonical IPv6 `/128` targets. Complete [native identity/bootstrap](docs/local-ax.md#native-egress-policy-bootstrap) before spawning. Local one-hour credentials require explicit refresh and a live native port-forward. There are no default allowed destinations; IP rules are not domain/port isolation.

## Install the extension

**Release preparation:** the public npm package is `@rothcold/pi-ax`; `@rothcold/pi-ax@0.1.0` has not been published by this preparation. Once it is available on npm, the consumer commands are:

```sh
pi install npm:@rothcold/pi-ax@0.1.0
# Later, remove the extension registration/package (not retained AX tasks):
pi remove npm:@rothcold/pi-ax@0.1.0
```

Pi installs npm dependencies and records personal packages in its agent directory. For a project-only package registration, use `pi install --local npm:@rothcold/pi-ax@0.1.0` (and `pi remove --local npm:@rothcold/pi-ax@0.1.0`); review/trust that project's `.pi/settings.json`. This does **not** add a project `.pi/ax-config.json` override. Package code runs on your host: review it before installing. See Pi's [official package instructions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).

Before publication, use a [developer checkout](#developer-checkout-and-local-ax) instead. The npm tarball ships the example, source, protobufs, worker recipe and exact root tooling shrinkwrap, never local caches/auth. Pi's npm manager suppresses host-peer auto-installation; local paths are not copied or dependency-installed by Pi.

## Configure and run

Configure endpoints, image and model in Pi's agent directory: `~/.pi/agent/ax-config.json` by default, or `ax-config.json` inside `PI_CODING_AGENT_DIR`. The extension uses Pi's exported `getAgentDir()`, including its tilde handling, not a literal `pi-agent` folder or project `.pi` configuration.

Copy the shipped [ax-config.example.json](ax-config.example.json) into that directory as `ax-config.json`, without overwriting an existing file, and edit the non-secret placeholders. After a personal npm installation, the **default agent-directory** paths are:

```sh
mkdir -p ~/.pi/agent
cp -n ~/.pi/agent/npm/node_modules/@rothcold/pi-ax/ax-config.example.json ~/.pi/agent/ax-config.json
# Edit ax-config.json and merge your reviewed native egress fragment before spawning.
```

If you set `PI_CODING_AGENT_DIR`, use Pi's expanded agent directory for both paths instead. For a project-only install the example is at `.pi/npm/node_modules/@rothcold/pi-ax/ax-config.example.json` in that project; the destination remains the agent directory. For a checkout, copy the example from its root. `pi list` shows configured packages.

For the documented local environment, the example's addresses and atespace match the loopback port-forwards. Set `workerImage` to the literal digest reference printed by `cat .cache/pi-ax/worker-image`. JSON does not expand shell variables or commands. Set `workerProvider` and `workerModel` to your explicit supported choices, and `credentialEnv` to an array of environment credential names, for example `["ANTHROPIC_API_KEY"]`. Supply their values separately through your environment/secret manager. Never put credential values in JSON, source, argv, prompts, Task metadata or Pi login copies. Use `[]` for no credentials.

The file is authoritative: legacy `PI_AX_*` runtime settings are ignored, with no environment fallback. The seven base fields are required when loading; `egress` is additionally required for every new spawn, while old records remain manageable without it; unknown keys, malformed JSON, unsafe addresses/names and duplicate/reserved credential names are rejected without echoing file contents. Optional `stateDir` selects an absolute private directory outside the source tree. Migrate an old state-directory override by copying its path into `stateDir`; existing records do not need conversion. No state is moved automatically.

Loading the extension without this file still registers all five tools. Spawn and E2E operations require valid configuration and report the expected file path if missing. Retained-task management needs only storage selection and persisted task settings, not current model selection. Storage is selected when tools first create a manager; restart Pi after changing `stateDir`. There is no watcher or configuration layering.

New tasks require explicit `egress` settings: native Substrate TLS `address`, DNS `serverName`, absolute `caFile`/`bearerTokenFile` paths, and a nonempty `cidrs` list of canonical IPv4 `/32` or IPv6 `/128` targets. No broad rules or product target defaults are provided. The existing gateway stays enabled. Policy credentials are read only during spawn; policy creation and verified actor binding must precede activation/upload/start. Denial, conflict or uncertain creation retains the task as unknown, without retry/overwrite. Retained-task management never needs policy credentials. See [local identity bootstrap and no-key verification](docs/local-ax.md#native-egress-policy-bootstrap).

CIDRs permit destination IPs, not domains or ports. Opaque TLS cannot use hostname rules as a substitute; these settings do not guarantee domain isolation or fix upstream isolation limitations. Select only explicitly intended addresses; changing name resolution may require explicit policy/configuration review, not automatic allowlist expansion.

Model credential values are read only for named entries during execution, never while loading configuration. AX control/router addresses must be plaintext `host:port` on a trusted/local connection, not TLS-looking URLs silently downgraded. For local AX, keep both control/router loopback forwards and the native TLS forward running. The image must be registry-qualified, immutable and independently runtime-verified; build success alone does not prove AX selected it.

With configuration complete, make only the listed model credential variables available through your environment/secret manager, then start `pi` in the working tree you intend to snapshot. No host Pi login is copied to the worker. A persistent installation loads the extension automatically; a checkout can use `pi --extension /absolute/path/to/pi-ax`.

| Tool | Purpose |
| --- | --- |
| `ax_spawn({prompt, cwd?})` | Persist identity and return before remote preparation/worker completion |
| `ax_status({taskId?})` | Query one or discover all retained tasks, including after Pi restart |
| `ax_result({taskId})` | Export verified patch/logs/manifest into a protected local directory |
| `ax_cancel({taskId})` | TERM, then KILL if needed; confirm wrapper exit and owned-descendant cleanup |
| `ax_destroy({taskId, allowUnrecoveredLoss?})` | Explicit deletion, guarded by preserved results unless destructive loss is authorized |

Local acceptance harnesses are separate: both share durable cross-output ownership/backpressure, archive verified terminal results before deleting only their owned task, and retain/block uncertain runs. See [E2E bounds and recovery](docs/local-ax.md#bounded-e2e-ownership-and-recovery). Local archives are retained; this does not change normal extension retention below.

Default: one active task per state directory, 900-second guest process timeout, no automatic retry, no conversation resumption, no automatic patch application/push/deletion. A worker-owned Linux subreaper covers ordinary detached Pi bash tools; its 890-second Pi budget leaves cleanup/export time before the unchanged 900-second guest watchdog. Wrapper exit without correlated descendant-cleanup proof remains unknown and retains its reservation. State defaults to `~/.pi-ax`; `stateDir` in `ax-config.json` can select another absolute private directory outside the source tree. Keep that directory to manage tasks after restart. AX `ResumeTask` is used internally only for initial activation.

Typical host-Pi request: “Use ax_spawn on this working tree to implement and test SQLite CRUD. Return the task ID, then poll ax_status and export ax_result when it exits. Do not apply or push the patch.” Inspect the returned `patchPath`, logs and `archive.json`; ask for `ax_destroy` only after export/review. `allowUnrecoveredLoss:true` explicitly sacrifices unknown/incomplete work and must not be used as routine recovery. To stop a job use `ax_cancel`, then retrieve any available results; transport abort is not cancellation.

Read [host lifecycle/configuration/recovery](docs/lifecycle.md), [worker/snapshot protocol and image](worker/README.md), and [pinned AX source verification](docs/ax-verification.md). `implementation.md` is a historical draft, not the implementation contract.

## Boundaries

- Working-tree snapshots include uncommitted/new source but exclude common credential/config/dependency paths and reject unsafe outward symlinks. New spawns also reject included aliases of the configured native bearer file by resolved path/device/inode, before persistence/upload. Already-excluded bootstrap paths remain usable. This is not arbitrary-content secret detection; copied secret contents are not detected.
- Credentials go through guest `StartProcess.env`, not Task metadata. Logs are bounded and defensively redacted. Exact patches are not rewritten; malicious workers can disclose secrets. No secrecy guarantee against malicious worker code.
- Upstream AX authentication, network-isolation and resource-enforcement shortcomings are **documented/deferred limitations**, not new hardening deliverables. Do not expose control/debug endpoints to untrusted networks.
- Host storage survives Pi restart, not arbitrary loss of the host directory or upstream cluster/guest history. Uncertain starts are never silently rerun; incomplete results require explicit loss consent before destruction.
- Historical Pi 0.99.2 images and the unchanged root development dependency tree have an inherited high-severity `brace-expansion` denial-of-service advisory. Audit each newly built worker separately; no upstream shrinkwrap override is applied.

## Developer checkout and local AX

From a source checkout (not a consumer npm prefix):

```sh
npm ci
npm run check
npm run build:worker
npm run check:package
pi --extension .
```

A C compiler (`cc`) is also required for worker builds/tests. The manifest loads the extension for this invocation without changing Pi settings. For a persistent project-only checkout install, run `pi install --local /absolute/path/to/pi-ax` from your task project, review/trust the project configuration, and later use `pi remove --local /absolute/path/to/pi-ax`. Run `npm ci` in the checkout first; Pi does not install local-path dependencies.

Follow [local AX setup, bootstrap and cleanup](docs/local-ax.md) for opt-in real infrastructure. `npm run local:ax -- prepare|create|deploy|cleanup` and `npm run e2e:wire|e2e:sqlite -- /absolute/fresh/evidence-directory` are never part of unit tests. Wire is not a model test; SQLite requires explicit model credentials. Additional developer commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run generate:proto`.

Worker Pi is intentionally unlocked: `npm run build:image` freshly resolves npm `latest` on every build, fails on lookup/invalid-version errors, and passes the version into Docker's install cache input. No worker lock or worker `npm ci` is used. Rebuild, deploy and explicitly select a new immutable digest to upgrade; neither running tasks nor host Pi auto-upgrade. The build verifies/prints the installed version and records `org.pi-ax.pi.version` and `/opt/pi/pi-version`; save the log. Future latest compatibility requires renewed validation.

## Verification scope

One real `minimax/MiniMax-M3` Pi-on-AX SQLite CRUD run passed on 2026-10-15, including source/database export, termination proof and four-resource cleanup, **only for the image recorded in [validation evidence](docs/v1-validation.md)**. Earlier activation, snapshot and model failures and untested recovery cases remain recorded there. Root Pi 0.99.2 tests are separate host evidence. Before the npm scope rename, release preparation also installed the then-unscoped packed tarball with npm into fresh isolated dependency trees and loaded all five tools plus configuration-schema probes using actual Pi **0.99.2 and 1.2.0** (npm latest at that check), without a model/session. This exercised local tarball npm installation, not an npm-registry release. After the rename, `@rothcold/pi-ax@0.1.0` separately passed a fresh isolated local-tarball install and the same actual loader/schema probes on host Pi **1.2.0**; the scoped package check uses root-tooling Pi **0.99.2**. These checks do not accept a newer worker image or promise future host compatibility. Unit/integration tests, local Git/subprocess checks and image builds are not model/AX E2E.

## License

Original pi-ax code is licensed under the [MIT License](LICENSE). Vendored AX/Substrate protobuf definitions retain their [Apache-2.0 license](proto/LICENSE) and copyright notices. See [wire definition provenance](proto/PROVENANCE.md) for those files and their generated types, and [worker image provenance](worker/PROVENANCE.md) for separately licensed image components.
