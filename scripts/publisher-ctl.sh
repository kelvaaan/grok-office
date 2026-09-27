#!/usr/bin/env bash
# Box-side control for the activity publisher:  scripts/publisher-ctl.sh start|stop|restart|status|log
set -u
cd "$(dirname "$0")/.."
LOG="${PUBLISHER_LOG:-/workspace/grok-office-publisher.log}"
pids() { pgrep -f '^node scripts/box-publisher.mjs' || true; }
case "${1:-status}" in
  start)
    if [ -n "$(pids)" ]; then echo "already running: $(pids)"; exit 0; fi
    setsid nohup node scripts/box-publisher.mjs >> "$LOG" 2>&1 < /dev/null &
    sleep 1; echo "started: $(pids) (log: $LOG)";;
  stop) p=$(pids); [ -n "$p" ] && kill $p && echo "stopped $p" || echo "not running";;
  restart) "$0" stop; sleep 1; "$0" start;;
  status) p=$(pids); [ -n "$p" ] && echo "running: $p" || echo "not running"; tail -n 5 "$LOG" 2>/dev/null;;
  log) tail -n 40 -f "$LOG";;
  *) echo "usage: $0 start|stop|restart|status|log"; exit 1;;
esac
