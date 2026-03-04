#!/bin/bash
# Launch Jamulator in a chromeless Chrome window on localhost

PORT=8364
DIR="$(cd "$(dirname "$0")" && pwd)"

# Find Chrome
if [[ -d "/Applications/Google Chrome.app" ]]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif command -v google-chrome &>/dev/null; then
  CHROME="google-chrome"
elif command -v chromium &>/dev/null; then
  CHROME="chromium"
else
  echo "Chrome not found" >&2
  exit 1
fi

# Start a simple local server (Python 3)
python3 -m http.server "$PORT" -d "$DIR" &>/dev/null &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null" EXIT

# Wait for server to be ready
for i in {1..20}; do
  curl -s "http://localhost:$PORT/" >/dev/null && break
  sleep 0.1
done

# Open Chrome in app mode
"$CHROME" --app="http://localhost:$PORT" --new-window 2>/dev/null &

echo "Jamulator running at http://localhost:$PORT"
echo "Press Ctrl+C to stop"
wait $SERVER_PID
