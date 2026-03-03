#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

case "${1:-up}" in
  down)
    docker compose stop arangodb
    echo "ArangoDB stopped."
    ;;
  up|*)
    echo "Starting ArangoDB..."
    docker compose up -d arangodb
    echo "Waiting for ArangoDB..."
    for i in $(seq 1 20); do
      if curl -sf http://localhost:8529/_api/version > /dev/null 2>&1; then
        echo "ArangoDB is ready at http://localhost:8529"
        echo ""
        echo "To start the Memory Layer:"
        echo "  cd memory-layer && sbt run"
        exit 0
      fi
      sleep 1
    done
    echo "Warning: ArangoDB health check timed out."
    exit 1
    ;;
esac
