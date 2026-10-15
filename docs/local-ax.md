# Local real AX development route

This is a test environment, not production hardening. The corrected pinned kind route passed real AX guest file/process roundtrip, supervision of detached Pi bash, and one model-driven SQLite CRUD run on 2026-10-15. The model run verified export before task/actor/template/golden cleanup. Earlier failures and untested recovery cases remain recorded in [actual validation](v1-validation.md); acceptance applies to that recorded image and configuration. There is no Docker-only substitute or mock service in this route.

## Prerequisites and scope

Linux x64, Docker daemon, Node >=24.13.0/npm, Git, Go (automatic toolchain download enabled), curl, make, a C compiler (`cc`) for local tests/build, openssl, jq, util-linux flock; substantial free disk and RAM (this host has 47 GiB RAM). No sudo, global tool installation, cloud resources or host authentication files. `prepare` downloads kubectl v1.36.0 with SHA verification and runs pinned kind v0.33.0/ko v0.19.1 tool modules. Go caches/tools, empty HOME/Docker config, sources, manifests, kubeconfig and evidence stay in ignored `.cache/pi-ax/`.

Source archives are SHA-256 verified:

| Source | Commit | Archive SHA-256 |
| --- | --- | --- |
| google/ax | ac2332829f22360ff97b0ba34d94dd0dd782f17e | 9b98d0c22d3962b2a1f0f6ab3135e4513d5dc63c4dfd3cc26d562f94ea7224a9 |
| agent-substrate/substrate | 944abe3278b895ccbf5d45555a49dd0f2f6ceae7 | 946a66c6bfd82a6c91f7479d3aec2a80c309af12f0d8dc5c97303e1f21fa1427 |
| agent-substrate/env | 4468a200b1702503ef9b84cf078e58ac517ad877 | 4a99ed2bdd9d98a6d228b83cec0b9c30d02cdf7b85ed1f49ab1f3de1698c300b |

Sources are not patched. Empty Git metadata lets the official installer use `git rev-parse`; no files are staged/committed. Explicit version ldflags identify the pinned source despite unborn checkout warnings from ko. Upstream licenses remain in each source archive and the worker image. Cluster setup derives from pinned `hack/create-kind-cluster.sh` but **never runs its unconditional cluster deletion/registry replacement**. The registry container, Docker network and kind cluster use a fresh `pi-ax-<UTC timestamp>-<random>` name. `KIND_EXPERIMENTAL_DOCKER_NETWORK` isolates the network; kind labels this override experimental. Kubeconfig is always private, never merged into host configuration.

## Build and deploy

From the project root (or unpacked development tarball with dev dependencies):

```sh
npm ci
npm run check
npm run build:worker
npm run build:image
npm run local:ax -- prepare
npm run local:ax -- create
npm run local:ax -- deploy
```

`npm ci` installs only the root's exact tooling lock. There is no worker project lock and no worker `npm ci` step. Every `npm run build:image` freshly resolves npm Pi `latest`, uses the resolved version as the install layer's cache input, and records it in the build log, image label `org.pi-ax.pi.version` and `/opt/pi/pi-version`. Save that log. Registry failures stop the build; raw Docker builds without the required version argument fail. To upgrade worker Pi, rebuild, deploy the new image, then explicitly select the newly produced immutable digest in your configuration. Existing tasks/images and host Pi do not auto-upgrade. Future Pi compatibility needs renewed validation; the previous 0.99.2 guest probes do not accept a newer image.

Stop on a failing step; inspect `.cache/pi-ax/` and the command output. Do not switch to ordinary Docker or fabricate success. `create` refuses an existing environment marker, so it cannot silently delete/recreate an earlier cluster. Interrupted downloads may need explicit removal of the failed archive after inspection. No deployment retry loop is supplied.

The installer uses official `hack/install-ate-kind.sh --deploy-ate-system --rollout-timeout 300s`, with local PostgreSQL/RustFS and pinned ko sources. A small `ax-system` gVisor WorkerPool has **two workers**, each with a **memory limit of 8Gi and request of 4Gi** (CPU limit 4/request 250m unchanged): a new template's golden actor needs spare capacity alongside the single actual task. A Running Pod is not proof of a free actor slot. The 2026-10-15 local rollout and post-model readback confirmed these limits and two idle ACTIVE workers. Other deployments still require an explicitly authorized rollout after occupied workers are safely cleared; recheck current capacity before each live run. This does not change the extension's one-active-task limit. Worker image version ldflags match the node/pool source-version labels. AX's published manifests are rendered into cache, not patched upstream: image references become locally pushed digests and `AX_SNAPSHOTS_BUCKET` becomes `gs://ate-snapshots/pi-ax/`. The `gs://` spelling is intentional: pinned `objectstore.BucketPrefix` uses URI bucket/path while the kind overlay selects the S3 backend/RustFS. No GCS resources are created.

Registry port is allocated by Docker on loopback. The upstream atelet `kind-registry:5000` alias resolves only within this project's unique network. `worker-image` selects the **registry-qualified** digest, not Docker's arbitrary first alias. No images are published outside the local registry. `PI_AX_LOCAL_IMAGE` optionally selects an already-built local worker tag for deployment.

The official Redis manifest is ephemeral; this route is not cluster-restart persistence acceptance. AX's inherited authentication, network-isolation, Task resource enforcement, implicit Gemini injection and template-cleanup limitations are deferred. The fresh AX Deployment has no model keys or `gemini-api-secret`; do not add implicit keys there. Keep all control/debug access local/trusted.

## Connect and validate

In two terminals, from the project root (port choices must be free):

```sh
export KUBECONFIG="$PWD/.cache/pi-ax/kubeconfig"
.cache/pi-ax/tools/kubectl -n ax-system port-forward --address 127.0.0.1 svc/ax-server 18080:8080
# second terminal: set KUBECONFIG as above, then
.cache/pi-ax/tools/kubectl -n ate-system port-forward --address 127.0.0.1 svc/atenet-router 18081:80
```

Configure `ax-config.json` in Pi's agent directory as described in the [README](../README.md). Use `controlAddress: "127.0.0.1:18080"`, `routerAddress: "127.0.0.1:18081"`, `atespace: "ax-system"`, and set `workerImage` to the literal contents of `.cache/pi-ax/worker-image`. The E2E harness reads the same JSON file, not legacy runtime environment variables. The wire probe still validates all required fields, but does not use model/provider settings or read model credential values; non-secret placeholders in those model fields and `credentialEnv: []` are sufficient for wire-only testing. Valid native policy credentials and explicit target CIDRs are still required.

**Before the first wire run**, complete [native egress policy bootstrap](#native-egress-policy-bootstrap): select explicit intended host IPs (`/32` or `/128`), bootstrap the verified native identity for this authorized cluster, and manually merge its non-secret `egress-config.json` fragment into the agent-directory configuration. Keep its additional native TLS port-forward alive alongside the two forwards above. The one-hour token must be explicitly refreshed by bootstrapping again and selecting the new credential file paths; there is no automatic refresh. For a retained/uncertain run, preserve the original native endpoint, TLS authority and CA bytes when refreshing credentials; follow [original-scope recovery](#bounded-e2e-ownership-and-recovery), not a new target or arbitrary new port. Do not run wire with the example identity paths or documentation CIDRs.

In the test terminal, only after those prerequisites:

```sh
npm run e2e:wire -- /tmp/pi-ax-wire-unique-evidence
```

Use a **fresh absolute evidence directory**. The wire probe calls real AX Create/Resume, readiness, guest binary Write/Read, Start/GetProcess and output RPCs; it checks Node/Pi/SQLite availability inside that guest and compares installed Pi to `/opt/pi/pi-version`, not a repository-pinned release. The build-version file is required, so historical images predating it need rebuilding before this updated probe. It also starts actual Pi bash under the native guard, deliberately sends guest group SIGKILL to that test wrapper, and checks descendant-reaping proof. This is not a full 900-second wait. It needs no model credentials and never calls a model. It persists ownership/start intent, binds the configured native policy before activation, and follows the shared [bounded E2E lifecycle](#bounded-e2e-ownership-and-recovery) below. Complete terminal evidence is archived before automatic owned-task deletion; uncertain execution/export/cleanup blocks subsequent runs. A successful probe would **not** prove Pi SQLite CRUD. Review archived Actor/template image, `SANDBOX_CLASS_GVISOR`, worker assignment, guest runtime and process/file hashes separately. Pinned upstream `go run ./cmd/kubectl-ate get actor <name> -a ax-system -o yaml` and `get actor-template <name> -a ax-system -o yaml` support this inspection; run from the cached Substrate module with the same private HOME/Go caches/KUBECONFIG, never host Kubernetes credentials.

For the genuine model test, set `workerProvider`, `workerModel` and `credentialEnv` explicitly in `ax-config.json` as in the main README and supply key values through your own environment. No Pi auth extraction is allowed:

```sh
npm run e2e:sqlite -- /tmp/pi-ax-sqlite-unique-evidence
```

This requires a nonempty explicit allowlist, spawns the actual one-shot worker through `TaskManager`, requests real SQLite CRUD/assertions, recreates the host manager before result retrieval, checks a successful bash execution marker/addition/deletion patch and source non-mutation, and keeps the local artifacts for review. It does not auto-apply the patch. A verified terminal archive (including a failed model/test run) is followed by guarded owned-task deletion and native absence checks; incomplete/uncertain runs retain ownership and block new harness creates. **Automated markers are not sufficient alone:** independently inspect exported program, database patch, command/results and runtime evidence. This harness is not a host-side SQLite or model-fixture substitute. Real 900s watchdog, signal/cancel, lost-reply and offline retention acceptance remain separate runtime cases.

## Bounded E2E ownership and recovery

Both modes share `.cache/e2e-ownership/owner.json` and a Linux `flock` held across execution/export/cleanup. The location is relative to this installation, independent of evidence path, mode and runtime configuration. Preserve this directory across runs/restarts; deleting it or using another checkout bypasses the local bound and is not recovery. Normal extension task retention/API and `~/.pi-ax` remain unchanged. Existing pre-ledger tasks are not discovered or deleted: reconcile those explicitly by their known identities before first use against an occupied environment.

**Bound:** at most one unresolved harness run per installation, normally one AX task, its dedicated template and its transient golden actor (potentially two worker slots). No background scheduler, TTL, task enumeration cleanup or limit on local archives/object-store snapshots is supplied. All artifacts stay local after cleanup. This is not a global cluster quota across unrelated installations or extension clients.

The evidence directory must be fresh (exclusive mkdir); `privateDirectory` then fsyncs its parent before any intent or remote work. A durability failure leaves no new remote attempt or singleton intent; that local directory cannot be reused as fresh evidence.

Before remote create, the fsynced singleton records the wire ref or the SQLite run's dedicated TaskStore path, plus `nativeScope`: exact native service address, TLS server authority and SHA-256 of the public CA PEM bundle used for trust. TaskManager persists the generated SQLite ID before its first RPC, so a crash before `task-id.json` still leaves a recoverable identity. Execution errors export `diagnostic.json` plus available `status.json`/`result-view.json`; only safe fixed RPC operation/status survives, never raw exception details. A failed acceptance check remains a failed command even if cleanup succeeds.

Before deletion, the harness saves source hashes, AX identity, native actor/template image/sandbox/assignment and golden identity derived from the actual template UID. Native GetActor/GetActorTemplate use the same verified TLS/CA/SNI/file bearer policy as the policy client; no raw template environment or upstream error body is archived. The scope fingerprint is computed from the exact public CA bytes supplied to each TLS connection, not from bearer values or token hashes. No raw CA, credential path or token is added to the ownership identity. Native capture/confirmation must match the original scope; both modes also check scope immediately before issuing owned AX deletion. Missing authentication, unexpected/shared template, protocol/ownership ambiguity, missing termination proof or incomplete export retains the run. The complete archive manifest hashes fsynced/read-back files. SQLite retains its snapshot/request, result/termination manifests, patch and logs; the wire probe retains bytes/process/output/runtime/supervision evidence. These files remain reviewable after deletion; declared host provenance is not proof of deployed image contents.

Native assignment gotcha: `WorkerAssignment.worker` identifies a **global** Worker (`atespace: ""`, valid resource name), not a namespaced Actor/ActorTemplate. The evidence validator handles Worker refs separately and preserves absent assignment/worker as null; malformed/non-global Worker refs still fail closed. Actor/ActorTemplate namespaces remain required. This follows pinned Substrate `944abe3278b895ccbf5d45555a49dd0f2f6ceae7`: `proto/ateapi/ateapi.proto` WorkerAssignment/ObjectRef and upstream `internal/resources/validate.go` ValidateGlobalObjectRef. Kubernetes worker namespace/pool fields are not the Worker's API scope.

Cleanup attempts AX DeleteTask once (SQLite uses guarded TaskManager.destroy without loss consent). It only releases the singleton after AX Task, native task Actor, its exact ActorTemplate and its UID-derived golden Actor all return NotFound. A delete ACK alone, a still-existing resource or a lost reply does not release it. This does not establish object-store GC or immediate scheduler capacity; verify actual free assignments before a capacity-sensitive live run.

**Recovery:** inspect the singleton's output/identity first, never launch a replacement run. For SQLite, inspect that dedicated store even if `task-id.json` is absent; use existing status/result/destroy against the persisted record, with no Resume/Start replay. Recover and hash-check results/runtime evidence before any explicit deletion. Wire recovery uses the recorded task/process intents and exact native identity chain. Unrecoverable valuable/unidentified results require explicit loss authorization before destructive cleanup. Preserve recovery evidence locally.

After an archived delete attempt or interrupted post-delete confirmation, this command performs **read-only** absence checks and re-verifies archive hashes under the same lock, without repeating DeleteTask:

```sh
node --import tsx scripts/e2e.ts reconcile
```

Use configuration selecting the recorded AX/router/atespace **and the original native service address, TLS authority and identical public CA bundle contents**. Token rotation and relocation of token/CA file paths are permitted; endpoint/SNI/CA-content changes are not. Even a new loopback forward at a different port is not silently equivalent: restore the original authorized endpoint/authority/trust to use this recovery command. The exact bundle bytes are fingerprinted, so reformatting/reordering the bundle also requires restoring the original bytes. Scope is checked before native absence reads can release ownership; unrelated NotFound results cannot clear it. Missing or malformed legacy `nativeScope` fails closed and is never inferred from current configuration. Preserve that ledger for separately reviewed recovery using original evidence; this harness has no scope migration, override or identity-backfill feature.

Existing resources, denied/unavailable readback, a changed archive, or a pre-delete/export-uncertain stage remain blocked. For those stages, an operator must finish explicit archival/owned cleanup, then audit the ledger transition under `ownership.lock`; there is intentionally no force-unlock/automatic discard switch. Keep the original ledger and recovery evidence rather than deleting `.cache` to bypass the block. Native template/golden leftovers may require separately authorized targeted reconciliation; this harness never mutates them directly or deletes unrelated resources.

## Native egress policy bootstrap

The existing Substrate gateway remains enabled; the extension supplies the missing per-actor native policy, not a new gateway or bypass. **Every new TaskManager spawn requires `egress`**, validated before snapshot/reservation and bound after AX CreateTask but before ResumeTask. Old v1 task management still works without these settings or credential files.

Choose explicit intended IPv4 `/32` or canonical IPv6 `/128` targets. No `all`, broad CIDR, hostname rule, dependency-source default or automatic DNS-derived expansion is supported. The shipped documentation address is not a working target. Opaque TLS is checked by IP CIDR, **not hostname or destination port**; this is not domain isolation. Existing upstream DNS/network/auth/resource limitations remain deferred. Name-resolution/Fake-IP changes are outside this integration.

For an already-authorized local cluster, explicitly select its project context and desired CIDRs:

```sh
npm run local:ax -- egress-bootstrap kind-pi-ax-<timestamp>-<suffix> <intended-IP>/32
```

This uses only `.cache/pi-ax/kubeconfig`, the existing `ate-system/ate-client` ServiceAccount, a standard one-hour TokenRequest for `api.ate-system.svc`, and the live `servicedns.podcert.ate.dev/identity` ClusterTrustBundle. It creates no RBAC/services/trust changes. A unique private `.cache/egress-policy-fix/bootstrap-*` directory contains a 0600 token, CA, non-secret `egress-config.json` fragment, bootstrap metadata and owned loopback port-forward PID/log. The token is never printed. TLS verifies `api.ate-system.svc` even when dialing loopback. Missing identity/bundle, command errors and invalid credentials stop without fallback. The existing identity is not claimed to have actor-level least privilege.

Review and manually incorporate only the non-secret fragment into your agent-directory configuration; the script never edits user/root/agent configuration. Expiry fails closed: explicitly bootstrap again and select its new file paths; there is no automatic identity rotation/downgrade. Keep the recorded port-forward alive while using those settings. Stop only that owned PID after verifying its command/ownership (or let the terminal owner stop it); never kill unrelated forwarding processes. Bootstrap itself does not create any actor or policy.

### Existing-actor no-key diagnostic (explicit authorization required)

For an authorized **retained** diagnostic actor, this opt-in script performs GET first; only NotFound permits one Create with the fragment's exact CIDRs. Existing conflicting/unsupported policy, denial, uncertain response or protocol failure stops; there is no Update/Delete or blind retry. A lost Create reply requires read-only reconciliation before any further action. Use a new evidence directory for every authorized attempt:

```sh
node --import tsx scripts/verify-egress.ts \
  /absolute/private/bootstrap-dir/egress-config.json \
  <atespace>/<retained-actor> 127.0.0.1:18081 \
  https://<intended-host>/<path> /absolute/fresh/evidence --create-if-absent
```

It confirms the live API gateway-address flag remains enabled, records policy readback/UID/version, and starts one bounded guest Node HTTPS **HEAD** with `env:{}`, normal certificate validation and no redirects. It reads no package metadata or guest auth files and does not re-run Pi. It creates/deletes no task and retains old results. TLS plus any HTTP response establishes connectivity only—not model authentication, POST/streaming behavior, or SQLite acceptance. No API keys are needed or forwarded. The separate wire harness is still not a model/network-policy acceptance test.

## Cleanup

First export/review all task results. Stop only your port-forward processes (Ctrl-C). The following explicitly authorizes destruction of this entire isolated test cluster, including unrecovered probe/tasks; it never prunes Docker or removes other clusters:

```sh
PI_AX_CONFIRM_DELETE="$(cat .cache/pi-ax/environment)" npm run local:ax -- cleanup
```

It verifies the project name/registry/network labels, deletes exactly that kind cluster/registry/network and retains logs, sources, image build cache and archives. Use extension `ax_destroy` for normal task-by-task guarded cleanup instead. Keep `~/.pi-ax` or your explicit state directory across Pi restarts; local state/results are not deleted by cluster cleanup. Remove only your own unused image tags/cache/evidence after inspection. No global Docker prune is part of this project.
