# Multi-stage Dockerfile for Plex Exporter Frontend
# Stage 1: Build the frontend
# Stage 2: Serve with Caddy

# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:lts-bookworm AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/

# Install dependencies for frontend workspace
RUN CI=true npm install --workspace @plex-exporter/frontend

# Copy source code
COPY apps/frontend/ apps/frontend/
COPY packages/shared/ packages/shared/

# Build frontend
RUN npm run build --workspace @plex-exporter/frontend

# Verify build output
RUN ls -la apps/frontend/public/dist/ && \
    test -f apps/frontend/public/dist/main.js && \
    test -f apps/frontend/public/dist/app.css && \
    echo "Frontend build successful"

# ============================================
# Stage 2: Serve with Caddy
# ============================================
FROM caddy:2-alpine

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# Copy built frontend from builder stage
COPY --from=builder /app/apps/frontend/public /srv/frontend

# Verify frontend files are copied
RUN ls -la /srv/frontend && \
    test -f /srv/frontend/index.html && \
    test -f /srv/frontend/dist/main.js && \
    echo "Frontend files copied successfully"

# Expose ports
EXPOSE 80 443

# Caddy runs as non-root by default
# Data and config directories are at /data and /config
VOLUME ["/data", "/config"]

# No custom entrypoint needed - Caddy Alpine image handles this
