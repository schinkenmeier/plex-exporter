#!/bin/sh
set -e

echo "=== Plex Exporter Container Starting ==="

# Run startup script for auto-import
echo "Running startup checks..."
node apps/backend/dist/scripts/startup.js || true

# Start the main server
echo "Starting Plex Exporter Backend..."
exec node apps/backend/dist/server.js
