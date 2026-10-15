# Build the real, unmodified pinned AX task runner, not a substitute entrypoint.
FROM golang:1.27.1-bookworm AS ax-builder
ADD --checksum=sha256:9b98d0c22d3962b2a1f0f6ab3135e4513d5dc63c4dfd3cc26d562f94ea7224a9 https://api.github.com/repos/google/ax/tarball/ac2332829f22360ff97b0ba34d94dd0dd782f17e /tmp/ax.tar.gz
RUN mkdir /src && tar -xzf /tmp/ax.tar.gz --strip-components=1 -C /src
WORKDIR /src
RUN CGO_ENABLED=0 go build -trimpath -o /out/ax-task-runner ./cmd/ax-task-runner \
    && go version -m /out/ax-task-runner > /out/ax-task-runner.modules.txt \
    && mkdir /out/licenses \
    && find /go/pkg/mod -type f \( -iname 'license*' -o -iname 'notice*' -o -iname 'copying*' \) -exec cp --parents '{}' /out/licenses \;

COPY worker/supervise.c /tmp/pi-ax-supervise.c
RUN cc -D_GNU_SOURCE -std=c11 -O2 -Wall -Wextra -Werror -o /out/pi-ax-supervise /tmp/pi-ax-supervise.c

FROM node:24.13.0-bookworm-slim AS wrapper-builder
WORKDIR /build
COPY package.json npm-shrinkwrap.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/credentials.ts src/workspace.ts src/worker-protocol.ts ./src/
COPY worker/run.ts worker/tsconfig.json ./worker/
RUN node node_modules/typescript/bin/tsc --project worker/tsconfig.json

FROM node:24.13.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git sqlite3 bash ca-certificates procps && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/pi
COPY worker/package.json ./
# Required build-time resolution from scripts/build-image.mjs, not a repository pin.
ARG PI_VERSION
RUN test -n "$PI_VERSION" || (echo 'Use npm run build:image to resolve the current Pi latest release' >&2; exit 1)
RUN npm install --omit=dev --no-save --package-lock=false "@earendil-works/pi-coding-agent@${PI_VERSION}" \
    && node -e 'const v = require("./node_modules/@earendil-works/pi-coding-agent/package.json").version; if (v !== process.argv[1]) process.exit(1); require("node:fs").writeFileSync("pi-version", v + "\n"); console.log("Installed worker Pi: " + v)' "$PI_VERSION" \
    && npm cache clean --force
LABEL org.pi-ax.pi.version=$PI_VERSION
COPY --from=ax-builder /out/ax-task-runner /usr/local/bin/ax-task-runner
COPY --from=ax-builder /src/LICENSE /usr/share/licenses/pi-ax/AX-LICENSE
COPY --from=ax-builder /out/licenses /usr/share/licenses/pi-ax/go-dependencies
COPY --from=ax-builder /out/ax-task-runner.modules.txt /usr/share/licenses/pi-ax/ax-task-runner.modules.txt
COPY --from=wrapper-builder /build/dist /opt/pi-ax/dist
COPY --from=ax-builder /out/pi-ax-supervise /opt/pi-ax/dist/worker/supervise
COPY package.json /opt/pi-ax/package.json
COPY LICENSE /usr/share/licenses/pi-ax/LICENSE
COPY worker/PROVENANCE.md /usr/share/licenses/pi-ax/PROVENANCE.md
RUN mkdir -p /workspace /root/.pi/agent
WORKDIR /workspace
EXPOSE 80
ENTRYPOINT ["/usr/local/bin/ax-task-runner"]
