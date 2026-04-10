#!/usr/bin/env bash
# ============================================================================
# Spa CRM — Local Development Startup Script
# Usage: bash dev.sh [--reset]
#   --reset  Clear local database and re-seed
# ============================================================================
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[0;33m'; NC='\033[0m'; BOLD='\033[1m'
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              Spa CRM — Development Server                ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Optional: reset database
if [[ "${1:-}" == "--reset" ]]; then
  echo -e "${YELLOW}Resetting local database...${NC}"
  rm -rf backend/.wrangler/state/v3/d1
  echo -e "${GREEN}Database cleared.${NC}"
fi

# Step 1: Install dependencies if needed
if [[ ! -d node_modules ]]; then
  echo -e "${CYAN}Installing dependencies...${NC}"
  npm install
fi

# Step 2: Initialize D1 local database
echo -e "${CYAN}Initializing local D1 database...${NC}"
cd backend
npx wrangler d1 execute spa-crm-db --local --file=./src/db/schema.sql 2>/dev/null || true
npx wrangler d1 execute spa-crm-db --local --file=./src/db/seed.sql 2>/dev/null || true
cd "$ROOT_DIR"

echo ""
echo -e "${GREEN}${BOLD}Database ready.${NC}"
echo ""
echo -e "${YELLOW}${BOLD}Test Invite Codes:${NC}"
echo -e "  ${BOLD}CLIFSPA2026${NC}    — for first admin registration"
echo -e "  ${BOLD}SPAWELCOME01${NC}   — backup invite code"
echo ""
echo -e "${YELLOW}${BOLD}Test Flow:${NC}"
echo -e "  1. Register with invite code → Login"
echo -e "  2. Create Store (set Staff PIN + Admin PIN)"
echo -e "  3. New tab → Sync Device → paste Store ID → Staff PIN"
echo -e "  4. Try: New Client, Check-In, Therapist Queue, Close Out"
echo ""
echo -e "${CYAN}Starting backend (port 8787) and frontend (port 5173)...${NC}"
echo ""

# Step 3: Kill any leftover processes on our ports
for port in 8787 5173; do
  pid=$(lsof -t -i:"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo -e "${YELLOW}Killing leftover process on port $port (PID $pid)${NC}"
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
done

# Step 4: Start both servers
cd "$ROOT_DIR/backend" && npx wrangler dev --port 8787 2>&1 &
BACKEND_PID=$!

cd "$ROOT_DIR/frontend" && npx vite --port 5173 2>&1 &
FRONTEND_PID=$!

# Cleanup on exit
cleanup() {
  echo ""
  echo -e "${CYAN}Shutting down...${NC}"
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  wait 2>/dev/null
  echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT INT TERM

# Step 4: Wait for frontend to be ready, then open browser
echo -e "${CYAN}Waiting for servers to start...${NC}"
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:5173/ 2>/dev/null; then
    echo ""
    echo -e "${GREEN}${BOLD}Servers ready! Opening browser...${NC}"
    # Try xdg-open (Linux), open (macOS), or just print URL
    if command -v xdg-open &>/dev/null; then
      xdg-open "http://localhost:5173/landing" &>/dev/null &
    elif command -v open &>/dev/null; then
      open "http://localhost:5173/landing"
    else
      echo -e "  Open ${BOLD}http://localhost:5173/landing${NC} in your browser"
    fi
    break
  fi
  sleep 1
done

echo ""
echo -e "${CYAN}Press Ctrl+C to stop both servers.${NC}"
echo ""

# Wait for either to exit
wait
