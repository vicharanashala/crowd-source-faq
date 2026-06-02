#!/bin/bash
# ============================================================
# Yaksha FAQ Portal — Frontend Runner
# Usage: ./scripts/frontend.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
FRONTEND="$ROOT/frontend"

# Resolve node_modules/.bin paths once
VITE="$FRONTEND/node_modules/.bin/vite"
NPM="$FRONTEND/node_modules/.bin/npm"

FONT="\033[94m"
OK="\033[92m"
WARN="\033[93m"
ERROR="\033[91m"
RESET="\033[0m"

log()   { echo -e "${FONT}[yaksha]${RESET} $1"; }
ok()    { echo -e "${OK}[✔]${RESET} $1"; }
warn()  { echo -e "${WARN}[!]${RESET} $1"; }
die()   { echo -e "${ERROR}[✘]${RESET} $1" >&2; exit 1; }

is_running() {
  curl -sf --max-time 3 http://localhost:5173 > /dev/null 2>&1
}

stop_port() {
  local port=$1
  local pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    warn "Port $port in use — killing PID $pid"
    kill $pid 2>/dev/null || true
    sleep 1
  fi
}

# ── Check / start frontend ─────────────────────────────────────────────────────
if is_running; then
  ok "Frontend already running on http://localhost:5173"
else
  stop_port 5173
  cd "$FRONTEND"

  log "Checking Node.js..."
  node --version > /dev/null || die "Node.js not found"
  [ ! -x "$VITE" ] && die "vite not found at $VITE — run: cd frontend && npm install"

  log "Starting frontend (vite)..."
  echo ""
  # Kill orphaned vite on port 5173 before starting
  pkill -f "vite" 2>/dev/null || true
  sleep 1
  "$VITE" --port 5173 > /tmp/yaksha-frontend.log 2>&1 &
fi
