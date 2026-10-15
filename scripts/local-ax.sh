#!/usr/bin/env bash
# Isolated local developer environment. Never invokes upstream cluster deletion scripts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.cache/pi-ax"
AX_REV=ac2332829f22360ff97b0ba34d94dd0dd782f17e
SUB_REV=944abe3278b895ccbf5d45555a49dd0f2f6ceae7
ENV_REV=4468a200b1702503ef9b84cf078e58ac517ad877
mkdir -p "$CACHE/tools" "$CACHE/home" "$CACHE/docker" "$CACHE/go"
# Neither kubectl, ko nor Go may consult host cloud/login/config files.
export HOME="$CACHE/home" DOCKER_CONFIG="$CACHE/docker" GOCACHE="$CACHE/go/build" GOPATH="$CACHE/go" GOENV=off
export PATH="$CACHE/tools:$PATH" GOTOOLCHAIN=auto
unset GOOGLE_APPLICATION_CREDENTIALS AWS_PROFILE AWS_SHARED_CREDENTIALS_FILE
fetch() {
  local repo="$1" rev="$2" sum="$3" name="$4"
  if [[ ! -f "$CACHE/$name.tar.gz" ]]; then
    curl --fail --location --max-time 300 "https://api.github.com/repos/$repo/tarball/$rev" -o "$CACHE/$name.tar.gz"
  fi
  echo "$sum  $CACHE/$name.tar.gz" | sha256sum --check -
  if [[ ! -d "$CACHE/$name" ]]; then
    mkdir "$CACHE/$name"
    tar -xzf "$CACHE/$name.tar.gz" --strip-components=1 -C "$CACHE/$name"
    # Upstream scripts require rev-parse. Empty local metadata only: no staging/commits.
    git -C "$CACHE/$name" -c init.defaultBranch=main init --quiet
  fi
}
kind() { (cd "$CACHE/substrate/hack/tools/kind" && go tool kind "$@"); }
ko() { (cd "$CACHE/substrate/hack/tools/ko" && go tool ko "$@"); }
case "${1:-help}" in
  prepare)
    for tool in docker curl git go make openssl jq node; do
      command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
    done
    docker info >/dev/null
    fetch google/ax "$AX_REV" 9b98d0c22d3962b2a1f0f6ab3135e4513d5dc63c4dfd3cc26d562f94ea7224a9 ax
    fetch agent-substrate/substrate "$SUB_REV" 946a66c6bfd82a6c91f7479d3aec2a80c309af12f0d8dc5c97303e1f21fa1427 substrate
    fetch agent-substrate/env "$ENV_REV" 4a99ed2bdd9d98a6d228b83cec0b9c30d02cdf7b85ed1f49ab1f3de1698c300b env
    if [[ ! -x "$CACHE/tools/kubectl" ]]; then
      curl --fail --location --max-time 180 https://dl.k8s.io/release/v1.36.0/bin/linux/amd64/kubectl -o "$CACHE/tools/kubectl"
      curl --fail --location --max-time 60 https://dl.k8s.io/release/v1.36.0/bin/linux/amd64/kubectl.sha256 -o "$CACHE/tools/kubectl.sha256"
      echo "$(cat "$CACHE/tools/kubectl.sha256")  $CACHE/tools/kubectl" | sha256sum --check -
      chmod 755 "$CACHE/tools/kubectl"
    fi
    kind version
    ko version
    kubectl version --client
    ;;
  create)
    [[ ! -e "$CACHE/environment" ]] || { echo 'Existing environment: inspect/clean it explicitly; refusing recreation.' >&2; exit 1; }
    name="pi-ax-$(date -u +%Y%m%d%H%M%S)-$(openssl rand -hex 3)"
    # Inspect before creation, including stopped containers. No same-name reuse.
    if docker container inspect "$name-registry" >/dev/null 2>&1; then echo 'Registry name collision' >&2; exit 1; fi
    if docker network inspect "$name" >/dev/null 2>&1; then echo 'Network name collision' >&2; exit 1; fi
    clusters="$(kind get clusters)"
    if grep -Fxq "$name" <<< "$clusters"; then echo 'Cluster name collision' >&2; exit 1; fi
    printf '%s\n' "$name" > "$CACHE/environment"
    export KIND_EXPERIMENTAL_DOCKER_NETWORK="$name" KUBECONFIG="$CACHE/kubeconfig"
    docker network create --label pi-ax.environment="$name" "$name"
    docker run -d --name "$name-registry" --label pi-ax.environment="$name" --network "$name" --network-alias kind-registry -p 127.0.0.1::5000 registry:3@sha256:ddf754342cfc8acc51a56d5d0ab6af06826461864460636d8bd5c546dab2a7b8
    port="$(docker port "$name-registry" 5000/tcp | sed 's/.*://')"
    printf '%s\n' "$port" > "$CACHE/registry-port"
    cat > "$CACHE/kind.yaml" <<'YAML'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
featureGates:
  ClusterTrustBundle: true
  ClusterTrustBundleProjection: true
  PodCertificateRequest: true
runtimeConfig:
  certificates.k8s.io/v1beta1: 'true'
networking:
  ipFamily: ipv4
kubeadmConfigPatches:
- |
  kind: KubeletConfiguration
  serializeImagePulls: false
  maxParallelImagePulls: 4
YAML
    kind create cluster --name "$name" --image kindest/node:v1.37.0 --config "$CACHE/kind.yaml" --kubeconfig "$KUBECONFIG" --wait 180s
    for node in $(kind get nodes --name "$name"); do
      docker exec "$node" sysctl net.ipv4.conf.all.proxy_arp=1
      docker exec "$node" mkdir -p "/etc/containerd/certs.d/localhost:$port"
      printf '[host."http://kind-registry:5000"]\n' | docker exec -i "$node" cp /dev/stdin "/etc/containerd/certs.d/localhost:$port/hosts.toml"
    done
    echo "Created $name; isolated kubeconfig: $KUBECONFIG"
    ;;
  deploy)
    name="$(cat "$CACHE/environment")"; port="$(cat "$CACHE/registry-port")"
    [[ "$name" =~ ^pi-ax-[0-9]{14}-[a-f0-9]{6}$ ]]
    export KUBECONFIG="$CACHE/kubeconfig" KIND_CLUSTER_NAME="$name" KUBECTL_CONTEXT="kind-$name"
    export KO_DOCKER_REPO="localhost:$port" KO_DEFAULTPLATFORMS=linux/amd64 VERSION="$SUB_REV"
    # No source modifications; pinned official local installer, generated output stays in cache.
    (cd "$CACHE/substrate" && bash hack/install-ate-kind.sh --deploy-ate-system --rollout-timeout 300s)
    # Build only the gVisor worker. This is not an ordinary Docker substitute for AX.
    worker_image="$(cd "$CACHE/substrate" && bash hack/run-tool.sh ko build ./cmd/ateom-gvisor --platform=linux/amd64 --ldflags="-X=github.com/agent-substrate/substrate/internal/version.Version=$SUB_REV")"
    sed -e "s|WORKER_IMAGE|$worker_image|" -e "s|SUBSTRATE_VERSION|$SUB_REV|" "$ROOT/scripts/local-workerpool.yaml" > "$CACHE/workerpool.yaml"
    kubectl --context "$KUBECTL_CONTEXT" apply -f "$CACHE/workerpool.yaml"
    kubectl --context "$KUBECTL_CONTEXT" wait --for=create deployment/pi-ax-workers -n ax-system --timeout=120s
    kubectl --context "$KUBECTL_CONTEXT" rollout status deployment/pi-ax-workers -n ax-system --timeout=300s
    image="${PI_AX_LOCAL_IMAGE:-pi-ax-worker:local}"
    docker tag "$image" "localhost:$port/pi-ax-worker:v1"
    docker push "localhost:$port/pi-ax-worker:v1"
    docker image inspect --format '{{json .RepoDigests}}' "localhost:$port/pi-ax-worker:v1" | node "$ROOT/scripts/image-ref.mjs" "localhost:$port/pi-ax-worker" > "$CACHE/worker-image"
    # Resolve ko from its pinned tool module, then execute in AX's module directory.
    ko_bin="$(cd "$CACHE/substrate/hack/tools/ko" && go tool -n ko)"
    ax_image="$(cd "$CACHE/ax" && "$ko_bin" build ./cmd/ax-server --platform=linux/amd64)"
    sed -e "s|ko://github.com/google/ax/cmd/ax-server|$ax_image|" -e 's|gs://dberkov-gke-dev3/ate-env/|gs://ate-snapshots/pi-ax/|' "$CACHE/ax/deploy/ax-server.yaml" > "$CACHE/ax-server.yaml"
    kubectl --context "$KUBECTL_CONTEXT" apply -f "$CACHE/ax/deploy/redis.yaml" -f "$CACHE/ax-server.yaml"
    kubectl --context "$KUBECTL_CONTEXT" rollout status deployment/ax-server -n ax-system --timeout=180s
    echo 'AX deployed. Use documented loopback port-forwards; no automatic background processes.'
    ;;
  egress-bootstrap)
    # No deployment changes: existing identity/trust, explicit intended host CIDRs only.
    exec node --import tsx "$ROOT/scripts/bootstrap-egress.ts" "${@:2}"
    ;;
  cleanup)
    name="$(cat "$CACHE/environment")"
    [[ "$name" =~ ^pi-ax-[0-9]{14}-[a-f0-9]{6}$ ]]
    [[ "${PI_AX_CONFIRM_DELETE:-}" == "$name" ]] || { echo "Set PI_AX_CONFIRM_DELETE=$name after exporting results; this destroys this whole test cluster." >&2; exit 1; }
    export KUBECONFIG="$CACHE/kubeconfig" KIND_EXPERIMENTAL_DOCKER_NETWORK="$name"
    kind delete cluster --name "$name"
    if docker container inspect "$name-registry" >/dev/null 2>&1; then
      [[ "$(docker inspect -f '{{index .Config.Labels "pi-ax.environment"}}' "$name-registry")" == "$name" ]]
      docker rm -f "$name-registry"
    fi
    if docker network inspect "$name" >/dev/null 2>&1; then
      [[ "$(docker network inspect -f '{{index .Labels "pi-ax.environment"}}' "$name")" == "$name" ]]
      docker network rm "$name"
    fi
    rm "$CACHE/environment"
    # Retain build logs, images, sources, and evidence; no Docker prune/global deletion.
    ;;
  *) echo 'Usage: npm run local:ax -- prepare|create|deploy|egress-bootstrap|cleanup';;
esac
