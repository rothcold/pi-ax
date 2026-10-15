# Vendored AX and Substrate wire definitions

Unmodified Apache-2.0 upstream files; original copyright headers retained. Full license: `LICENSE`.

| File | Upstream source | Commit | SHA-256 |
|---|---|---|---|
| `ax/v1alpha1/ax.proto` | https://github.com/google/ax/blob/ac2332829f22360ff97b0ba34d94dd0dd782f17e/pkg/apis/v1alpha1/ax.proto | `ac2332829f22360ff97b0ba34d94dd0dd782f17e` | `fa3466e3de468c065d57b333775402196ae13268ae577d16ec9a9f2f62177907` |
| `ateenv/v1alpha/guest.proto` | https://github.com/agent-substrate/env/blob/4468a200b1702503ef9b84cf078e58ac517ad877/proto/ateenv/v1alpha/guest.proto | `4468a200b1702503ef9b84cf078e58ac517ad877` | `e42206e1ce07ce515caae4754de58a29211cbf632cb2316440299f3856f7240d` |
| `ateapi/ateapi.proto` | https://github.com/agent-substrate/substrate/blob/944abe3278b895ccbf5d45555a49dd0f2f6ceae7/pkg/proto/ateapipb/ateapi.proto | `944abe3278b895ccbf5d45555a49dd0f2f6ceae7` | `9615fb4ff27d2f0e4ec626346781418c897c59eafe94fb9ae2ad7db63ee5814a` |

Copied from the verified local upstream audit trees without changing upstream. Standard `google/protobuf` definitions resolve from the pinned proto-loader/protobufjs dependency. `npm run generate:proto` regenerates `src/ax/generated/` from these files and adjusts only TypeScript import extensions for NodeNext.

Runtime and generation both use camelCase fields, string enums, string int64 values (including timestamps/durations), defaults and oneof discriminators. Bytes remain `Buffer`. These generated types include upstream services we do not expose. `src/ax/client.ts` is the AX/guest application boundary; `src/ax/egress-client.ts` keeps ordinary native policy operations limited to `CreateActorEgressPolicy` and `GetActorEgressPolicy`; a separate harness-only authenticated readback boundary supports `GetActor`/`GetActorTemplate` evidence without exposing bearer metadata or template environment, not general Control administration.

Guest routing uses `ate-target-actor: <atespace>/<name>`, as in AX `internal/guest/client.go`. Readiness alone is HTTP `GET /readyz?check=workspace` with the same header, as in AX `internal/controller/reconciler.go:247-258`; no readiness gRPC exists in these protos. Other exposed operations are gRPC. AX/guest addresses are plaintext host:port and must remain on a trusted local network. The separate native policy channel requires explicit CA verification, DNS server identity, TLS 1.3 and file-sourced bearer authentication; it never falls back to plaintext. Upstream authentication/network/resource-enforcement shortcomings remain documented limitations. Policy CIDRs authorize destination IPs, not domains or ports; opaque TLS cannot rely on hostname rules. The example's documentation-only IP is a placeholder, not a product allowlist/default.
