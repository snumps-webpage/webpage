# --- STAGE 1: Build ---
FROM node:22-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy dependency files
COPY pnpm-lock.yaml package.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build the SvelteKit app
RUN pnpm run build

# --- STAGE 2: Runner ---
FROM node:22-alpine AS runner

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Install only production dependencies
RUN npm install -g pnpm && pnpm install --prod --frozen-lockfile

# Set environment to production
ENV NODE_ENV=production

# Standard port for SvelteKit (adapter-vercel handles this on Vercel, 
# but this is for local/containerized runners)
EXPOSE 3000

CMD ["node", "build"]
