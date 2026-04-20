# --- STAGE 1: Dependencies ---
# Pinning version for reproducible builds
FROM node:22.14.0-alpine3.21 AS deps
RUN npm install -g pnpm@10.3.0

WORKDIR /app

# Copy dependency manifests
COPY pnpm-lock.yaml package.json ./

# Install all dependencies (including devDeps for build)
RUN pnpm install --frozen-lockfile

# --- STAGE 2: Build ---
FROM node:22.14.0-alpine3.21 AS builder
RUN npm install -g pnpm@10.3.0

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the SvelteKit app
RUN pnpm run build

# --- STAGE 3: Runner ---
FROM node:22.14.0-alpine3.21 AS runner

# Set environment to production
ENV NODE_ENV=production
WORKDIR /app

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S svelteuser -u 1001 -G nodejs

# Install pnpm (needed for prod install)
RUN npm install -g pnpm@10.3.0

# Copy built assets and manifests
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

# Set correct ownership
RUN chown -R svelteuser:nodejs /app

# Switch to non-root user
USER svelteuser

# Standard port for SvelteKit
EXPOSE 3000

# Healthcheck to ensure the app is responding
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "build"]
