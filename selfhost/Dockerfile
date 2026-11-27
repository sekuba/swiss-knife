# syntax=docker/dockerfile:1
# Build context is the repository root:
#   docker build -f selfhost/Dockerfile .
# Normally driven by selfhost/update.sh through selfhost/compose.yaml.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: no dependency gets to run install-time code.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY . .

# Optional: upstream's browser-style specs for the kept tools. About ten
# minutes, and not fully green upstream, so they do not gate the build.
#   docker build -f selfhost/Dockerfile --target test-ui .
FROM deps AS test-ui
RUN pnpm test:ui

FROM deps AS build
# Fast logic tests (decoder, metadata, clear signing) gate every build. They
# run before the NEXT_PUBLIC_* settings below, as upstream writes them against
# its default configuration.
RUN pnpm test:unit
# NEXT_PUBLIC_* values are compiled into the browser bundle. They are public by
# definition: never pass a URL or key here that visitors must not see.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MAINNET_RPC_URL
ARG NEXT_PUBLIC_BASE_RPC_URL
ARG NEXT_PUBLIC_WC_PROJECT_ID
ARG NEXT_PUBLIC_SOURCE_URL
# Path-based navigation on a single origin (/tx, /explorer, /calldata/decoder)
# and same-origin API calls. Required for this build; not configurable.
ENV NEXT_PUBLIC_DEVELOPMENT=true \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_MAINNET_RPC_URL=$NEXT_PUBLIC_MAINNET_RPC_URL \
    NEXT_PUBLIC_BASE_RPC_URL=$NEXT_PUBLIC_BASE_RPC_URL \
    NEXT_PUBLIC_WC_PROJECT_ID=$NEXT_PUBLIC_WC_PROJECT_ID \
    NEXT_PUBLIC_SOURCE_URL=$NEXT_PUBLIC_SOURCE_URL
# `next build` also typechecks the whole tree.
RUN pnpm build
# The standalone server expects its static files next to it.
RUN cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public

# Runtime: no shell, no package manager, non-root (uid 65532).
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS run
WORKDIR /app
LABEL eth-sh-selfhost=1
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/.next/standalone ./
EXPOSE 3000
CMD ["server.js"]
