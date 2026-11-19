#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${1:-5173}"
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          🚀  BOOT N ASS // STARBURST LAN ARCADE  🚀          ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Local URL : http://localhost:${PORT}/                       "
echo "║  LAN URL   : http://${LAN_IP}:${PORT}/                       "
echo "║                                                              ║"
echo "║  Quick Boss Jumps (on LAN):                                  ║"
echo "║   • Boss 1 : http://${LAN_IP}:${PORT}/?level=neon-canyon&startDist=3520"
echo "║   • Boss 2 : http://${LAN_IP}:${PORT}/?level=prism-belt&startDist=4100"
echo "║   • Boss 3 : http://${LAN_IP}:${PORT}/?level=hyper-spire&startDist=4740"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

exec npx vite --host 0.0.0.0 --port "${PORT}"
