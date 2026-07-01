# ─────────────────────────────────────────────────────────────────────────────
# Cloud Run build stage: install deps + compile TS
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build

# Install build tools for native modules (sharp needs them at install time)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ─────────────────────────────────────────────────────────────────────────────
# Runtime stage: minimal image with prebuilt dist
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# sharp bundles prebuilt binaries for Debian; no need for build-essential at runtime.
# libvips for sharp's image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libvips \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Only production deps
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check hits the /health route
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
    CMD curl -sf http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]