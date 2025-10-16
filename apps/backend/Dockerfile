# syntax=docker/dockerfile:1

# Build stage
FROM node:lts-bookworm AS builder

WORKDIR /app

# Install backend workspace dependencies first to leverage Docker layer caching
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/

RUN npm install --workspace @plex-exporter/backend

# Copy the remaining project files and build the production bundle
COPY . .

RUN npm run build --workspace @plex-exporter/backend

# Production stage
FROM node:lts-bookworm-slim AS production

WORKDIR /app

# Copy package files for production dependencies only
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/

# Install only production dependencies
RUN npm install --workspace @plex-exporter/backend --omit=dev && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Create directories for data volumes
RUN mkdir -p /app/data/exports /app/storage/sqlite

ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 4000

CMD ["node", "apps/backend/dist/server.js"]
