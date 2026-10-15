# v1 validation

Current status, 2026-10-15 UTC: one real Pi-on-AX SQLite CRUD run passed, including verified export and resource cleanup. Acceptance is limited to the recorded image/model/configuration. Upstream authentication, network isolation and resource-enforcement limitations remain deferred.

Historical entries below describe their own phase, including earlier pending gates and failures. Their legacy environment assignments no longer configure the extension or E2E harness. Follow [current configuration](../README.md) for new runs. No historical failure or unrun recovery case is converted into a pass by the new result.

## Real SQLite acceptance and capacity recovery, 2026-10-15

Independent source reviews accepted the directory durability, native scope binding and global Worker reference corrections. Source checks passed lint/typecheck, 117/117 tests, worker build and the 248-asset actual Pi-loader package check. The parent separately checked the five Worker-reference correction file hashes. These local checks are distinct from the following real run.

One fresh owned SQLite harness run used `minimax/MiniMax-M3` in AX/gVisor. Explicitly authorized credentials were loaded only by the launch process into the test environment; no host Pi login was copied. The native egress rule remained `198.18.2.97/32`, with verified TLS and the existing gateway enabled. DNS, Fake-IP, routing, trust and upstream sources were not changed. No image rebuild or second harness/model-task attempt occurred.

- Task: `ax-system/ax-7e4291fe-2937-428d-b430-912845b0023a`; process: `proc-5b389d6fa7e5eeb732c97d16`.
- Image: `localhost:32770/pi-ax-worker@sha256:e682be857c9410f63e1cb91e5dba3f7acfc438ee41804c73249c8d395fa0b2b8`; template sandbox: `SANDBOX_CLASS_GVISOR`.
- Template: `ax-system/ax-7e4291fe-2937-428d-b430-912845b0023a-tmpl-193b6fc2`; template UID/golden: `ate-golden/36f8576c-26bd-470e-ad83-828a1eca4d82`.
- Accepted at `03:21:51.516Z`; worker ran `03:21:53.892Z` to `03:22:56.886Z`; cleanup confirmed at `03:22:57.432Z`.
- Actual guest tool execution created `crud.mjs` using `node:sqlite`, executed INSERT/SELECT/UPDATE/DELETE assertions and printed `PI_AX_SQLITE_CRUD_OK` from a successful bash result. The reviewed source checks each changed row/value and the final zero-row count. Guest output identified Node v24.13.0. A failed initial Python/runtime probe was followed by successful use of `/usr/local/bin/node` within the same model task.
- The patch contains the 2,157-byte source, an 8,192-byte SQLite database as a Git binary patch, the expected `keep.txt` edit and `delete-me.txt` deletion. It was not applied to the host source tree. The original input snapshot remained unchanged.
- Worker exit0 and correlated `termination.json` confirmed completion. The parent independently verified all 19 files in the harness archive manifest and inspected the CRUD source and guest tool results, not only the marker.
- AX Task, native Actor, exact ActorTemplate and UID-derived golden all returned NotFound after guarded deletion. The shared ownership record reached `cleaned`; the operator also verified that its flock could be acquired/released without creating another task.

Evidence: `.cache/e2e/sqlite-capacity-042d10c67001/`, including `archive.json`, `native-evidence.json`, `absence.json`, `cleanup.json` and the task's `results/` patch/logs/manifests. Preserve these private local artifacts and `.cache/e2e-ownership`; they are not shipped in the package. Future image builds require new acceptance.

Before this run, the three explicitly authorized historical test chains were archived and deleted once each. Normal AX cleanup also removed their templates/goldens; no direct native deletion was needed. The parent verified all 44 files in `.cache/e2e-capacity-fix/runtime-l61pfu__/legacy-manifest.json`. The old SQLite failure was fully exported before normal `destroy(false)`. The old probe's exact wire marker and correlated termination record were recovered; its missing original ledger/stdout remain a partial historical export, not proof of complete unknown-work recovery.

Only the WorkerPool memory limit changed to 8Gi. Both new Pods and native workers were Ready/ACTIVE with zero restarts and empty assignments after rollout and again after model cleanup. Replicas remained 2, memory requests 4Gi, CPU limits 4 and requests 250m. Each worker had one free actor slot. Before/after inventories, deletion intents/absence records, probe exports and rollout evidence remain in `.cache/e2e-capacity-fix/runtime-l61pfu__/`. No ordinary extension retention policy, broad cleanup or automatic retry was added.

## Global Worker reference correction, 2026-10-15

Parent-reported runtime readback failed with sanitized UNKNOWN for occupied actors whose `workerAssignment.worker` has empty atespace. Source verification confirmed the pinned contract: Substrate `944abe3278b895ccbf5d45555a49dd0f2f6ceae7` defines WorkerAssignment.worker as global in `proto/ateapi/ateapi.proto:607–616`, and `internal/resources/validate.go` ValidateGlobalObjectRef requires empty atespace plus a valid name. The helper incorrectly reused namespaced Actor/ActorTemplate validation.

The narrow correction separates Worker validation, types its evidence scope as the empty-string literal, and repairs one synthetic fixture that incorrectly used a `workers` atespace. Actor/ActorTemplate validation, nullable assignment/worker handling, TLS/actual-CA scope binding, sanitized failures, archive/cleanup and no-retry safeguards are unchanged. Two new in-process TLS regressions reproduce both prior failures (valid global ref rejected as UNKNOWN; non-global ref wrongly accepted), then pass with global UUID-shaped fixture names, malformed/non-global rejection, required Actor/ActorTemplate namespaces and unchanged null handling.

Validation: focused native tests **13/13**; `npm run check` lint/typecheck and **117/117**, zero failures/skips/cancellations; `npm run build:worker` passed; `npm run check:package` passed **248 assets**, actual Pi-loader/schema checks, no model/session. Private before/after snapshots, bounded RED/GREEN/full-check logs, diff and hashes: `.cache/e2e-capacity-fix/worker-ref-FSCp8N7N/`. No staging/commits. This source-only correction did not access credentials, infrastructure, model APIs or the independent operator's runtime artifacts; it does not establish new live/model acceptance. The subsequent independent source review returned OK with no issues; the separately approved real run is recorded above.

## E2E ownership review corrections, 2026-10-15

Both accepted P1 findings were corrected and passed retained-reviewer verification. **No live/key access, remote mutation or runtime acceptance occurred in this correction lane.**

- Evidence durability: exclusive fresh-output mkdir is followed by existing `privateDirectory(output)` before intent persistence or execution. Its parent fsync establishes directory-entry durability. A test injects EIO at the actual filesystem-open/FileHandle.sync seam: no intent/create/delete occurs on failure; the directory still cannot be reused, and a later uncertain run retains cross-output blocking. The final test fails against the preserved pre-fix helper (which proceeds through deletion without this fsync) and passes against corrected source.
- Native scope: both harness intents/singletons now persist exact native endpoint, TLS authority and SHA-256 of the public CA PEM bytes before remote create. Capture/confirmation compare the original scope to the CA bytes actually loaded for that TLS channel; pre-delete guards reject retargeting. No token/token hash, raw CA or credential path is added to this identity. Recovery rejects missing/malformed legacy scope instead of inferring it from current config. Same endpoint/authority/CA contents permit token rotation and file-path relocation; changed forwarding ports, authorities or trust contents do not.
- Behavioral RED: two local TLS native services reproduced release of the original ownership through unrelated NotFound; both harness entry paths also reproduced deletion after native retargeting. GREEN: tests now reject those cases before native reads/delete, retain original template/golden evidence, reject an expanded CA bundle that still trusts the original server, and permit same-scope rotated-token/new-file paths for normal confirmation and the actual CLI reconciliation seam. Synthetic credentials only.
- Final `npm run check`: lint/typecheck and **115/115 tests passed**, zero failures/skips/cancellations (all prior 112 retained; three focused tests added). `npm run build:worker` passed. `npm run check:package` passed **248 assets** with actual Pi-loader/schema validation, no model/session.
- New private selected-file before/after snapshots, exact diff, SHA-256 lists and RED/GREEN/full-validation logs: `.cache/e2e-capacity-fix/corrections-YPebUQNF/`. No staging/commits; prior implementation/runtime evidence remains intact. Ordinary TaskManager retention/API, WorkerPool values and worker image/protocol are unchanged in these corrections.

Recovery requirements are authoritative in [bounded E2E ownership and recovery](local-ax.md#bounded-e2e-ownership-and-recovery). There is no scope-migration/backfill/force-unlock feature. Existing legacy resources, capacity proof, rollout and one authorized real SQLite acceptance remain separate blocked runtime gates, not implied by these local tests.

## Local E2E capacity/ownership source checks, 2026-10-15

**Source-only; no cluster rollout, old-task cleanup or model acceptance in this phase.** The WorkerPool manifest changes only limits.memory from 4Gi to 8Gi; two replicas, memory request4Gi and CPU settings remain unchanged. Both local E2E modes now share a durable singleton/flock independent of output/configuration, persist intent before create, archive/verify terminal results and native runtime evidence before owned deletion, and keep uncertain creation/start/export/deletion blocking future runs. Normal extension task retention/API is unchanged. Recovery and precise bounds are in [local-ax.md](local-ax.md#bounded-e2e-ownership-and-recovery).

- `npm ci`: root shrinkwrap install passed; npm reports **one high-severity vulnerability** in the locked dependency tree. No dependency override/audit fix or worker install was performed.
- `npm run check`: lint/typecheck and **112/112 tests passed**, zero failures/skips/cancellations. Eight added tests cover shared lifecycle, real cross-process lock/crash behavior, read-only reconciliation, both real harness entry paths with fake transport (SQLite uses actual TaskManager persistence/export/restart), and authenticated TLS native evidence/readback with synthetic credentials. The existing WorkerPool invariant test now checks limit8Gi/request4Gi/unchanged CPU and replicas.
- RED: newly introduced helper exports/modules failed before implementation; GREEN logs retained. Separately, cache-only regression mutations removing deletion and cross-output backpressure caused three behavioral tests to fail (missing delete, a second create, and incorrect delete count). Mutants were removed; this is regression-sensitivity evidence, not pre-fix live reproduction.
- `npm run build:worker`: passed wrapper/native-supervisor compilation. `npm run check:package`: passed **248 allowlisted assets**, actual Pi loader and config/schema checks, no model/session.
- Private selected-file baseline, baseline/changed hashes, diff and exact logs: `.cache/e2e-capacity-fix/source-J0XVnj/`. No root user configuration, secrets, cache contents or dependencies were copied into the baseline. No files staged.

These tests do not prove live cleanup, scheduler slot release, an applied 8Gi limit, current guest Pi compatibility, model POST/streaming or SQLite CRUD. Root-tooling detached-Pi-bash tests remain Pi0.99.2 tests, not acceptance of the existing guest Pi1.0.0/image. Current retained remote resources and historical failure artifacts were untouched; real capacity-safe archival/targeted cleanup/rollout and one authorized SQLite run remain separate runtime gates. Gateway/native policy constraints, excluded DNS/Fake-IP scope and upstream limitations remain unchanged.

## Native egress review corrections, 2026-10-05

Independent review found (P1) configured native bearer files could enter snapshots under ordinary/aliased names and (P2) native authentication status was discarded. Both corrected without changing record version, gateway/upstream behavior or retained-task management:

- Snapshot creation receives the configured bearer path, resolves symlinks and checks opened file device/inode before reading included bytes. Included aliases reject spawn before snapshot persistence/remote effects; already-excluded `.cache` bootstrap paths remain usable. Protected metadata is rechecked at completion; existing unsafe-link/concurrent-source checks remain. This is known-file identity protection, not arbitrary copied-secret detection.
- Only fixed last-native-operation/status text is retained in the existing note at the unstarted policy stage. Repeated status/restart preserves UNAUTHENTICATED (explicit approved-bootstrap refresh guidance), PERMISSION_DENIED, UNKNOWN and UNAVAILABLE distinctions without raw error details. Untyped errors become UNKNOWN; later stages discard old policy diagnostics. State/reservation/no-retry safeguards stay unchanged.
- RED: real spawn-to-snapshot regressions reproduced inclusion of ordinary, configured-symlink and hardlink token paths (three failures; excluded-cache control passed). Five diagnostic regressions failed before correction. GREEN: focused lifecycle/workspace **36/36**; full `npm run check` lint/typecheck and **104/104**, no failures/skips/cancellations. All prior 94 tests retained; ten added (four spawn/snapshot, five diagnostic, one workspace identity/alias case). Synthetic credentials only.
- `npm run build:worker` passed. `npm run check:package` passed, **244 assets**, actual Pi-loader/schema checks included. Private pre-fix baseline/hashes, after hashes/diff and RED/GREEN/build/package logs: `.cache/egress-policy-fix/corrections-tGqB7aXZ/`. Historical A/B evidence remains intact; no files staged.

No live policy/lifecycle call, token refresh, model request or process cleanup was performed for these corrections. The retained-actor connectivity proof below is historical and was not repeated. Real new-spawn policy ordering/restart/lost-reply behavior remains fixture-tested; authenticated model POST/streaming and full Pi/SQLite acceptance remain unproven.

## Native per-actor egress integration, 2026-10-05

Implemented required new-spawn native policy binding before activation, strict optional egress in v1 records, execution-only credential preflight, private local bootstrap and an explicit existing-actor no-key diagnostic. Old management/state location, result-loss safeguards, worker latest/root tooling pins and existing gateway remain unchanged. Policy failure/conflict/uncertain reply retains identity/stage as unknown; no automatic create/start replay or policy replacement/deletion.

- `npm run check`: lint/typecheck and **94/94 tests passed**, zero failures/skips/cancellations (prior 75 retained; A added nine transport/config tests, B added ten integration/lifecycle/store cases). Cross-process flock/reservation coverage remains real, not mocked.
- `npm run build:worker`: passed wrapper/native subreaper compilation.
- `npm run check:package`: passed **244 assets**, actual Pi loader registers five tools and now checks valid/invalid egress and persisted-config schemas. Initial actual-loader failure found Pi's missing `typebox/format` alias; switched to supported embedded `Type.Refine` predicates, retaining all strict checks without global registry assumptions. No loader/upstream/dependency change.
- These automated transport/lifecycle/bootstrap tests use fixtures, not live AX or model acceptance. Actual Pi bash supervision still identifies root-tooling Pi 0.99.2, not floating-image acceptance.

**Authorized live repair and connectivity-only proof:** explicit project kubeconfig/context `kind-pi-ax-20261005060812-529b13`, existing `ate-system/ate-client`, one-hour native TokenRequest, existing live service-DNS trust bundle and new owned loopback forward. No host Pi credentials/configuration read or model keys injected. GET of retained `ax-system/ax-e43a65e8-c02e-44a2-a817-9e07edccdd02` returned NotFound. One native Create and subsequent GET verified default policy UID `eb3992f6-5346-41f8-bee5-1da7ccb4818e`, version `1`, sole CIDR **198.18.2.97/32**. This explicitly authorized diagnostic address is not a product default.

The live `ate-system/ate-api-server` Deployment retained `--egress-gateway-address=atenet-egress.ate-system.svc:443` (generation 1, two ready replicas). One guest process `proc-33025d694e5dcba2602a0a93` (PID 78), with `env:{}` and 25-second bound, performed HEAD `https://api.minimax.io/anthropic/v1/messages`: normal certificate verification succeeded, TLSv1.2, HTTP **404**, zero redirects, zero stderr bytes, exit **0**. This proves HTTPS connectivity only, **not** authenticated model POST/streaming or SQLite CRUD. No new task, worker replay, guest package-metadata read, old-result deletion, gateway/DNS/Fake-IP/trust/routing modification or broad allow rule occurred. Actor/policy/results remain retained.

Private source baselines, exact diffs and logs: `.cache/egress-policy-fix/integration-ngs2dFDF/`; live evidence in its `live-probe/`. Native bootstrap credentials/CA/non-secret fragment and owned-forward metadata are in separate private `.cache/egress-policy-fix/bootstrap-XBgYTu/` (token never printed; explicit refresh required after expiry). The forward PID is recorded there for owner-verified cleanup; no unrelated forward was stopped. Original no-policy/CONNECT403/upstreamBytes0 failure remains unchanged in `.cache/e2e/pi-ax-sqlite-1791184636/reset-localization/`. That failure and the earlier activation/golden-snapshot errors remain historical limitations, not superseded by a model success claim. IP rules are not domain/port isolation; identity is not proven actor-scoped least privilege. Full model SQLite acceptance remains pending.

## Worker latest policy check, 2026-10-03

Worker Pi now resolves npm `latest` at each supported image build. Root tooling remains exactly locked, including its separate Pi 0.99.2 dependency. The 0.99.2 image/guest evidence and worker-lock commands below are historical, not current setup instructions or acceptance of newer Pi. No host Pi upgrade, configuration/auth read, AX deployment or model call was performed for this change.

- `npm run check`: passed lint/typecheck and 75/75 tests, zero failed/skipped/cancelled. All 70 preceding tests retained; five new image-builder regressions cover fresh lookup/cache input, lookup/invalid-version failure, Docker failure, reintroduced locks and shipped build assets. Fake npm/Docker tests are orchestration tests, not image or AX acceptance. Actual detached-bash tests identify the root-tooling runtime as Pi 0.99.2.
- `npm run build:worker`: passed wrapper TypeScript and native subreaper compilation.
- `npm run check:package`: passed, 127 assets; actual root-tooling Pi loader registers five tools. Root shrinkwrap and unlocked worker recipe/build script included; worker project locks excluded.
- `npm run build:image`: passed. Fresh npm `dist-tags.latest` resolved 1.0.0; the image installed 1.0.0. Local image index/ID: `sha256:9780e0032b2004d95e03e207ad1c3e78b119c2a228c9143d052f0c6f7df51b20`; image manifest: `sha256:c6e08ac44f29bc78019397b761805eddfd5b7a96c74e61522cd4eb69e5a40e31`. Not pushed or deployed.
- `docker image inspect` confirmed label `org.pi-ax.pi.version=1.0.0` and the unchanged AX runner entrypoint. A network-disabled container with only the entrypoint overridden for `pi --version` returned 1.0.0. A separate network-disabled Node metadata read confirmed installed version and `/opt/pi/pi-version` match the build resolution, no `/opt/pi` project locks exist, and Pi's upstream shrinkwrap remains installed.
- npm's image install still reported one high-severity vulnerability; no audit fix or upstream override was applied. This does not certify the new dependency tree as vulnerability-free.
- Root shrinkwrap SHA-256 unchanged; staged file list empty. Logs are in private ignored `.cache/worker-latest-validation/{check,build-worker,package,image,image-inspect,image-version,image-metadata}.log`. Commands used an isolated HOME/agent directory and empty Docker/npm user configuration. An initial validation-shell configuration error (npm rejects using `/dev/null` for both user and global config) was corrected before any build/test execution.

Rebuild to receive newer latest releases; existing images/tasks do not auto-update. Future compatibility is not guaranteed. The one-shot JSON contract and supervisor are unchanged; current Pi 1.0.0 CLI/JSON/settings/environment docs and relevant types were inspected. The updated wire probe compares guest Pi against the image's saved build version, so historical images without that file must be rebuilt for that probe. Full Pi 1.0.0 AX/gVisor SQLite/model acceptance and renewed guest supervision remain unrun. Prior activation and golden-snapshot limitations below remain preserved; upstream security/resource deficiencies remain deferred.

## Checked locally (historical 2026-10-01)

| Check | Result |
| --- | --- |
| `npm ci`; `npm ci --prefix worker` | Passed with exact npm shrinkwraps |
| `npm run check` | ESLint, TypeScript, **64 tests passed**, 0 failed/skipped/cancelled; all prior 56 retained, 8 review-regression tests added and existing signal/storage cases strengthened |
| `npm run build:worker` | Passed: TypeScript wrapper plus Linux C subreaper (`-Wall -Wextra -Werror`) |
| `npm run check:package` | Passed: extracted npm tarball, both shrinkwraps, source/protos/worker assets, actual Pi loader registers all five tools with clean HOME and no model/session |
| `npm view @earendil-works/pi-coding-agent version`; installed package metadata | Both 0.99.2 |
| `npm run build:image` | Passed with pinned AX runner/Node/Pi; final local image index `sha256:6260eb1f9c4ab944e4c6a12c0a62bda34df3b400cb932f4636593b90bd6d6091` |
| `npm audit --json` | **Failed**, one inherited high `brace-expansion` DoS advisory in pinned Pi tree; no silent override |
| `git diff --cached --name-only` | Empty; unborn repository remains untracked; review actual files |

Root/worker locks were renamed using `npm shrinkwrap --ignore-scripts` (and `--prefix worker`), without dependency changes. npm always omits `package-lock.json` from packed distributions; the new allowlisted shrinkwraps make packaged installation and image builds reproducible. Initial package check caught the missing root shrinkwrap allowlist entry; corrected and rechecked. Package-load verification uses the installed Pi loader and extracted sources, reusing lock-verified dependencies via a temporary symlink; it is **not** a fresh network installation or model run.

Tests cover the existing serialized gRPC, workspace/Git, wrapper subprocess, lifecycle-fake and real Linux lock cases, plus registry digest alias selection, setup version/capacity invariants, a collision-refusal test with stub Docker, and packaged actual Pi loading. None are a real AX guest success claim. Typechecking includes the real E2E script.

## Independent review fixes and successful follow-up

Both concrete findings were accepted and fixed, not dismissed as upstream security limitations:

1. **Detached Pi bash supervision:** pinned Pi's real bash implementation uses detached groups. New per-worker Linux native child-subreaper handles parent-death startup races, TERM/INT, an 890s Pi budget, one-second TERM→KILL escalation, and adopted descendants. It writes correlated `termination.json` only after all owned children are reaped; it never scans/kills unrelated process trees. Host status/cancel/export/deletion require both wrapper exit and that proof. Missing/mismatched evidence retains `unknown`/active, including migration of older wrapper-only completion records. Actual Pi bash tests cover wrapper TERM, guest-style group SIGKILL, shortened guard deadline, long-running detached descendants, normal exit with background work, unrelated-process survival, parent-registration race and unavailable-helper failure. No hostile-process containment claim.
2. **Rejected storage nonmutation:** canonical prospective location is checked before mkdir, including symlinked existing ancestors. Regressions assert nonexistent nested storage is rejected without changing source directory entries or creating directories.

Fresh authorized isolated run (same pinned route, corrected two-worker/version/digest configuration):

```sh
npm run build:image
npm run local:ax -- create
npm run local:ax -- deploy
# private kubeconfig; loopback port-forwards 18080/18081 as in docs/local-ax.md
PI_AX_ADDRESS=127.0.0.1:18080 PI_AX_ROUTER_ADDRESS=127.0.0.1:18081 \
PI_AX_ATESPACE=ax-system PI_AX_WORKER_IMAGE="$(cat .cache/pi-ax/worker-image)" \
npm run e2e:wire -- "$PWD/.cache/pi-ax/review-wire-evidence"
```

- **Passed:** fresh cluster/network `pi-ax-20261001183346-cfdd5a`, registry loopback port 32769, AX/Substrate/two gVisor workers ready. Exact image `localhost:32769/pi-ax-worker@sha256:bc0949ef1d2724fdae1ccd3b2aa1741fb11a0f82c8cb15c4026c623a813d5789`.
- **Passed:** real CreateTask/ResumeTask/readiness, binary WriteFile/ReadFile byte equality, guest Start/GetProcess and output. Actor `ax-system/pi-ax-probe-d73771b4-eb1e-4af9-bfad-166f9ab8490a` is `ACTOR_STATE_RUNNING`; actual template uses that image and `SANDBOX_CLASS_GVISOR`/`gvisor-default`. Guest reports Node v24.13.0, Pi 0.99.2, SQLite 3.40.1, kernel `4.19.0-gvisor`. File SHA-256 `3a99030e6c7d5bde9f25b847c43179b50a17bc84714fec3823e340bbb30a25da`; process `proc-18644c9ced3765c079490088` exited 0.
- **Passed:** `verifyGuestSupervision` from `scripts/guest-supervision.ts` was then invoked once against that retained real guest (no new task/replay). It starts the actual installed Pi bash implementation beneath the image's native helper, sends real guest `SIGNAL_KILL` to the wrapper group, and requires correlated descendant-reaping proof. Wrapper `proc-8ae1dd02421d3a22136f6cc7` exited 137; proof records interrupted=true and actual Pi child signal 15. The wire harness now includes this check for future runs. This validates the real guest supervision primitive, **not a model run or a 900-second elapsed watchdog wait**.
- **Observed upstream limitation, not investigated/modified:** although the actual actor ran and all above probes passed, template status reported `GoldenActorCrashed: golden actor crashed before its snapshot was taken`. Golden snapshot/recovery is not accepted; no upstream debugging or claim of resume support.
- **Not run:** true AX full-Pi SQLite model CRUD. Fresh presence-only check again found no `PI_AX_PROVIDER`, `PI_AX_MODEL` or `PI_AX_CREDENTIAL_ENV`; zero configured credential names. No host auth was read/copied and no model call was made. Running Pi's actual bash code is not running the full model loop.
- **Passed cleanup:** after exporting probe bytes/runtime/process/termination/Actor/template evidence, `PI_AX_CONFIRM_DELETE=pi-ax-20261001183346-cfdd5a npm run local:ax -- cleanup` removed only this test cluster/registry/network. Both port-forwards stopped; Docker container inventory before/after matched.

Final `npm ci` (root and worker), `npm run build:worker`, `npm run lint`, `npm run typecheck`, `npm test` (64/64), `npm run check:package` (124 assets, actual Pi loader) and `npm run build:image` all passed. Their logs are `review-final-{ci,worker-ci,build,lint,typecheck,tests,package,image}.log`. The final image adds `SA_RESTART` to make repeated termination signals non-disruptive to child enumeration; it was rebuilt and locally regression-tested after the successful guest probe, not redeployed. The actual guest-tested image remains the exact `bc0949...` digest recorded above.

Current evidence under `.cache/pi-ax/`: `review-{check,build-worker,package,image-build,create,deploy,wire,guest-supervision,cleanup}.log`, `review-credential-presence.txt`, `review-probe-{actor,template}.yaml`, `review-ax-pods.json`, `review-docker-{before,after}.txt`, and `review-wire-evidence/` containing `intent.json`, `task.json`, `roundtrip.bin`, `process.json`, `runtime.json`, `passed.json`, `supervision-{intent,process,termination,passed}.json`. Original failed-attempt evidence below is retained separately.

## Initial isolated infrastructure attempt (historical)

Commands ran from the repository root; stdout/stderr were saved under ignored `.cache/pi-ax/` (no credentials printed):

```sh
docker build --progress=plain -f worker/Dockerfile -t pi-ax-worker:integration-20261001 .
bash scripts/local-ax.sh prepare
bash scripts/local-ax.sh create
PI_AX_LOCAL_IMAGE=pi-ax-worker:integration-20261001 bash scripts/local-ax.sh deploy
```

- **Passed:** image build; verified AX/Substrate/env tarballs; local Go toolchains, kind 0.33.0, ko 0.19.1, kubectl 1.36.0; Docker 29.8.1.
- **Passed:** unique kind cluster/network `pi-ax-20261001174607-91eeb7`, registry container with that prefix, loopback port 32768, private kubeconfig. Kind used Kubernetes 1.37.0. PostgreSQL, RustFS, certificate controller, Substrate API/router/atelet and AX/Redis became ready.
- **Initial setup command failed:** ko `--bare` cannot publish to registry-only `localhost:32768` (`repository can only contain ...: localhost:32768`). Removed this local script mistake, then reran the same pinned route successfully. No upstream changes/protocol fallback.
- **Passed after that correction:** gVisor WorkerPool and AX server Deployment ready; worker pushed only to local registry. Initial image index `sha256:d013a8ac18f82fe4b01488aecaae9777782b41965505a15f5a0caf24b36924d5`; AX server image `localhost:32768/ax-server-340c3583cc4a989b584acf55b1619e8e@sha256:e3ba83f5e1d039e45289f5f6cb482d2771ffe281fd6d2dd83b03e64275b044cc`.

With two private-kubeconfig loopback port-forwards on 18080/18081:

```sh
PI_AX_ADDRESS=127.0.0.1:18080 PI_AX_ROUTER_ADDRESS=127.0.0.1:18081 \
PI_AX_ATESPACE=ax-system PI_AX_WORKER_IMAGE="$(cat .cache/pi-ax/worker-image)" \
node --import tsx scripts/e2e.ts wire "$PWD/.cache/pi-ax/wire-evidence"
```

- **Passed:** real AX `CreateTask`; task `ax-system/pi-ax-probe-f3f70a49-ec93-4988-b079-9ae55e590088` returned `Suspended` with matching actor.
- **Blocked:** `ResumeTask: INTERNAL; remote state is not established by this error`. No repeat Resume/Start was made. Substrate logged `while resuming golden actor: workflow failed at step AssignWorker: ... ResourceExhausted ... no free workers available`.
- **Read-only evidence:** actual Actor had `ACTOR_STATE_RESUMING` and an assignment to `pi-ax-workers`; template named `...-tmpl-18a60486` had `SANDBOX_CLASS_GVISOR`/`gvisor-default`, empty status. This proves real control-plane objects, **not guest startup/runtime isolation**.
- **Concrete setup corrections, not runtime-validated in the initial attempt:** allocate two workers for actual+golden actors; stamp worker binary version with the pinned Substrate SHA to match node/pool version labels; select registry-qualified Docker digest instead of arbitrary `RepoDigests[0]`. The attempted image string was wrongly unqualified `pi-ax-worker@sha256:d013...`; corrected selector resolves `localhost:32768/pi-ax-worker@sha256:d013...`. Regression checks cover digest selection and version/build configuration. Runtime exploration stopped at activation failure rather than debugging/reworking upstream.
- **Not reached:** guest readiness, binary file roundtrip, StartProcess, wrapper/Pi execution, patch/log export in a real sandbox. No passed wire receipt exists. A successful ordinary Docker run or local SQLite substitute was not used.
- **Not run:** genuine Pi SQLite CRUD; `PI_AX_PROVIDER`, `PI_AX_MODEL`, `PI_AX_CREDENTIAL_ENV` were all absent (presence booleans only checked). No host Pi auth/login was read or copied. Missing credentials remain a final limitation, not permission to invent credentials.
- **Not run:** real 900s timeout, TERM/KILL/cancel confirmation, dropped replies, host-process restart retrieval, long-offline result retention, real sentinel credential checks. Existing automated tests exercise their local/fake logic only.

Evidence files: `image-build.log`, `prepare.log`, `create.log`, `deploy.log`, `deploy-corrected.log`, `wire.log`, `wire-evidence/{intent,task}.json`, `ax-runtime.log`, `substrate-runtime.log`, `worker-runtime.log`, `probe-actor.yaml`, `probe-template.yaml`, `ax-pods.json`, `pods.txt`, `correct-worker-image`, `cleanup.log`, `check-final.log`, `package-check-final.log`, `image-build-final.log`. Paths are relative to `.cache/pi-ax/`; they are scratch evidence, not package/runtime dependencies. The documented scripts download pinned sources without referring to historical private `/tmp` checkouts.

## Initial-attempt cleanup

The probe never started a guest process or model. Its failed activation/objects/logs were exported for diagnosis. Explicit destructive cleanup of **only this test environment** then passed:

```sh
PI_AX_CONFIRM_DELETE=pi-ax-20261001174607-91eeb7 npm run local:ax -- cleanup
```

Both port-forwards stopped. Docker container-name inventory before/after matched; no unrelated containers/cluster/context/global config were changed. Build images and about 4.9 GiB of ignored sources/tool/build cache remain for review/manual reclamation; no Docker prune was run. Historical upstream sources were untouched. Corrected final image was built after cleanup, but not deployed again.

## Consolidated unresolved limitations / final acceptance

- One true AX Pi SQLite CRUD E2E passed on 2026-10-15 for the image/model recorded above. Future images/configurations require fresh acceptance with explicit credentials, never borrowed host Pi login.
- The successful harness recreated its TaskManager before retrieval, but full host-process restart recovery, a full 900-second watchdog wait, cancellation end-to-end via the Pi tools, dropped-reply recovery, long-offline retention and real credential sentinel tests remain unrun. Local/fake regressions and the real guest group-kill/subreaper check cover narrower contracts only.
- Golden snapshot creation reported the upstream crash status above; recovery/cluster restart is not accepted. Local Redis remains ephemeral. No product resume/retry feature exists.
- The helper needs Linux subreaper/PDEATHSIG and `/proc` child enumeration (confirmed in this gVisor guest). Missing/unsupported supervision or unkillable children produce no proof and retain unknown state/reservation; only explicit destructive cleanup can discard unrecovered work. This is not hostile-process containment.
- The inherited high Pi `brace-expansion` advisory, deferred upstream authentication/network/resource enforcement, image base-tag/apt non-content-pins, and raw patch/encoded-secret exposure remain documented limitations, not new engineering deliverables.
- Independent final review completed: both findings were verified fixed, with no remaining code blockers in the reviewed scope. The parent independently reran `npm run check` (64/64), `npm run build:worker` and `npm run check:package`; all passed. An additional eight-file LSP probe was partly inconclusive and reported two auxiliary unchecked-throwing-call findings at intentional invalid-JSON rejection boundaries (`src/task-store.ts:95`, `src/workspace.ts:47`); these were inspected, not treated as TypeScript failures or suppressed. No staging/commits/pushes/publication/global configuration changes occurred. Own build images and ignored caches/evidence remain for manual reclamation; both test environments were cleaned, and the parent confirmed the container-name inventory is unchanged. Do not claim final runtime acceptance from wire/process/supervision success alone.
