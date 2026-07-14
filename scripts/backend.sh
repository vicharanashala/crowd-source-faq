#!/bin/bash
# ============================================================
# Yaksha FAQ Portal — Backend Runner
#
# Tags: [ALERT] = red+bold, [INFO] = blue, [OK] = green, [WARN] = yellow
# Mirrors the backend logger so you can grep your way through.
#
# Usage: ./scripts/backend.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
BACKEND="$ROOT/apps/backend"

TSX="$BACKEND/node_modules/.bin/tsx"

# ── Terminal colors (ANSI) ───────────────────────────────────────────────────
F_INFO=$'\033[94m'
F_OK=$'\033[92m'
F_WARN=$'\033[93m'
F_ALERT=$'\033[1;31m'
F_DIM=$'\033[2m'
F_BOLD=$'\033[1m'
F_RESET=$'\033[0m'

# ── Tagged log helpers ──────────────────────────────────────────────────────
log()   { echo -e "${F_INFO}[INFO]${F_RESET} $1"; }
ok()    { echo -e "${F_OK}[OK]${F_RESET}   $1"; }
warn()  { echo -e "${F_WARN}[WARN]${F_RESET} $1"; }
alert() { echo -e "${F_ALERT}[ALERT]${F_RESET} $1"; }
dim()   { echo -e "${F_DIM}       $1${F_RESET}"; }
die()   { alert "$1" >&2; exit 1; }

is_running() {
  curl -sf --max-time 3 http://localhost:6767/csfaq/api/health > /dev/null 2>&1
}

stop_port() {
  local port=$1
  local pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    warn "port $port in use — killing pid $pid"
    kill $pid 2>/dev/null || true
    sleep 1
  fi
}

# ── Ensure .env exists ──────────────────────────────────────────────────────
if [ ! -f "$BACKEND/.env" ]; then
  warn ".env not found — creating from .env.example..."
  if [ -f "$BACKEND/.env.example" ]; then
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    log "created backend/.env from .env.example"
    log "edit backend/.env or run ./run.sh to configure env vars"
    exit 1
  else
    die "no .env and no .env.example found"
  fi
fi

# ── Check / start backend ───────────────────────────────────────────────────
if is_running; then
  ok "backend already running on http://localhost:6767"
  ok "health → http://localhost:6767/csfaq/api/health"
else
  stop_port 6767
  cd "$BACKEND"

  set -a
  source ".env" 2>/dev/null || true
  source ".env.local" 2>/dev/null || true
  set +a

  log "checking Node.js..."
  node --version > /dev/null || die "Node.js not found"
  [ ! -x "$TSX" ] && die "tsx not found at $TSX — run: npx pnpm@9 install"

  # Session log — timestamped, kept in logs/ next to run.sh
  SESSION_TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
  SESSION_LOG="$ROOT/logs/backend_${SESSION_TIMESTAMP}.txt"
  mkdir -p "$ROOT/logs"
  ln -sf "backend_${SESSION_TIMESTAMP}.txt" "$ROOT/backend_log.txt" 2>/dev/null || true

  log "starting backend (tsx watch src/server.ts)..."
  echo ""

  # Kill orphaned tsx on port 6767 before starting
  pkill -f "tsx.*server" 2>/dev/null || true
  sleep 1

  # tee to /tmp log (back-compat with old behavior) AND the session log
  "$TSX" watch src/server.ts 2>&1 | \
    sed -u "s/^\([^[]]*\)/${F_DIM}[backend]${F_RESET} \1/" | \
    tee "$SESSION_LOG" > /tmp/yaksha-backend.log &

  ok "backend started — log: $SESSION_LOG"
  if [ -n "$DISCORD_WEBHOOK_URL" ] && [ "$DISCORD_WEBHOOK_URL" != "###" ]; then
    ok "discord webhook configured — ALERTs will ping your channel"
  else
    dim "discord webhook not configured (DISCORD_WEBHOOK_URL=###) — ALERTs only hit console"
  fi
fi
