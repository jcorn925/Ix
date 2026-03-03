#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

case "${1:-up}" in
  down)
    docker compose down
    echo "Ix backend stopped."
    ;;
  logs)
    docker compose logs -f
    ;;
  clean)
    docker compose down -v
    echo "Ix backend stopped and data volumes removed."
    ;;
  up|*)
    echo "Building Memory Layer..."
    (cd memory-layer && sbt assembly 2>&1 | tail -5)
    echo "Starting Ix backend..."
    docker compose up -d --build
    echo "Waiting for health checks..."
    for i in $(seq 1 30); do
      if curl -sf http://localhost:8090/v1/health > /dev/null 2>&1; then
        echo "Ix Memory backend is ready at http://localhost:8090"
        exit 0
      fi
      sleep 2
    done
    echo "Warning: Backend health check timed out. Check 'docker compose logs' for details."
    exit 1
    ;;
esac
