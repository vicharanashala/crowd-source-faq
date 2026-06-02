#!/bin/bash
# ============================================================
# Yaksha FAQ Portal — Backend Runner
# Usage: ./scripts/backend.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
BACKEND="$ROOT/backend"

# Resolve node_modules/.bin paths once
TSX="$BACKEND/node_modules/.bin/tsx"
NPM="$BACKEND/node_modules/.bin/npm"

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
  curl -sf --max-time 3 http://localhost:6767/api/health > /dev/null 2>&1
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

# ── Ensure .env exists ─────────────────────────────────────────────────────────
if [ ! -f "$BACKEND/.env" ]; then
  warn ".env not found — creating from .env.example..."
  if [ -f "$BACKEND/.env.example" ]; then
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    log "Created backend/.env from .env.example"
    log "Edit backend/.env or run ./run.sh to configure env vars"
    exit 1
  else
    die "No .env and no .env.example found."
  fi
fi

# ── Check / start backend ──────────────────────────────────────────────────────
if is_running; then
  ok "Backend already running on http://localhost:6767"
  ok "Health: http://localhost:6767/api/health"
else
  stop_port 6767
  cd "$BACKEND"

  # Source .env first, then .env.local (local overrides take precedence)
  set -a
  source ".env" 2>/dev/null || true
  source ".env.local" 2>/dev/null || true
  set +a

  log "Checking Node.js..."
  node --version > /dev/null || die "Node.js not found"
  [ ! -x "$TSX" ] && die "tsx not found at $TSX — run: cd backend && npm install"

  log "Starting backend (tsx watch server.ts)..."
  echo ""
  # Kill orphaned tsx on port 6767 before starting
  pkill -f "tsx.*server" 2>/dev/null || true
  sleep 1
  "$TSX" watch server.ts > /tmp/yaksha-backend.log 2>&1 &
fi
