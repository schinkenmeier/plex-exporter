#!/bin/sh
set -e

echo "=== Plex Exporter Container Starting ==="

# Start the main server
echo "Starting Plex Exporter Backend..."
exec node apps/backend/dist/server.js
