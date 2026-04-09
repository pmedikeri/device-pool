import { NextRequest } from "next/server";

function heartbeatScript(): string {
  const lines = [
    '#!/bin/sh',
    '# Device Pool Heartbeat Agent',
    'CONFIG_DIR="$HOME/.devicepool"',
    'CONFIG_FILE="$CONFIG_DIR/config.json"',
    'INTERVAL="${1:-30}"',
    '',
    'if [ ! -f "$CONFIG_FILE" ]; then',
    '  echo "ERROR: Config not found at $CONFIG_FILE"',
    '  exit 1',
    'fi',
    '',
    "SERVER_URL=$(sed -n 's/.*\"serverUrl\" *: *\"\\([^\"]*\\)\".*/\\1/p' \"$CONFIG_FILE\")",
    "DEVICE_ID=$(sed -n 's/.*\"deviceId\" *: *\"\\([^\"]*\\)\".*/\\1/p' \"$CONFIG_FILE\")",
    "DEVICE_TOKEN=$(sed -n 's/.*\"deviceToken\" *: *\"\\([^\"]*\\)\".*/\\1/p' \"$CONFIG_FILE\")",
    '',
    'echo "Device Pool Agent"',
    'echo "  Device: $DEVICE_ID"',
    'echo "  Server: $SERVER_URL"',
    'echo "  Interval: ${INTERVAL}s"',
    'echo ""',
    '',
    "trap '' HUP  # ignore hangup signal",
    '',
    'while true; do',
    '  HN=$(hostname)',
    '  OSINFO="$(uname -s) $(uname -m)"',
    "  LUSER=$(who 2>/dev/null | head -1 | awk '{print $1}')",
    '  [ -z "$LUSER" ] && LUSER=$(whoami 2>/dev/null)',
    '  IP=$(hostname -I 2>/dev/null | awk \'{print $1}\')',
    '  if [ -z "$IP" ]; then',
    '    IFACE=$(route -n get default 2>/dev/null | awk \'/interface:/{print $2}\')',
    '    [ -n "$IFACE" ] && IP=$(ipconfig getifaddr "$IFACE" 2>/dev/null)',
    '    [ -z "$IP" ] && IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")',
    '  fi',
    '',
    '  # GPU name (NVIDIA or Apple)',
    "  GNAME=$(nvidia-smi --query-gpu=gpu_name --format=csv,noheader 2>/dev/null | head -1 || echo \"\")",
    "  [ -z \"$GNAME\" ] && GNAME=$(system_profiler SPDisplaysDataType 2>/dev/null | grep -i 'chip' | head -1 | sed 's/.*: *//' || echo \"\")",
    '',
    '  # CPU: sample /proc/stat twice',
    "  if [ -f /proc/stat ]; then",
    "    C1=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8}' /proc/stat)",
    "    I1=$(awk '/^cpu /{print $5}' /proc/stat)",
    "    sleep 1",
    "    C2=$(awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8}' /proc/stat)",
    "    I2=$(awk '/^cpu /{print $5}' /proc/stat)",
    "    CPU_PCT=$(echo \"$C1 $C2 $I1 $I2\" | awk '{d=$2-$1; i=$4-$3; if(d>0) printf \"%.0f\", 100*(d-i)/d; else print 0}')",
    "  else",
    "    CPU_PCT=$(top -l 1 -n 0 2>/dev/null | awk '/CPU usage/{gsub(/%/,\"\"); print 100-$7}' || echo 0)",
    "  fi",
    "  MEM_PCT=$(free 2>/dev/null | awk '/Mem:/{printf \"%.0f\", $3/$2*100}')",
    "  [ -z \"$MEM_PCT\" ] && MEM_PCT=$(vm_stat 2>/dev/null | awk '/Pages (active|wired)/{s+=$NF} /Pages free/{f=$NF} END{if(s+f>0) printf \"%.0f\", s/(s+f)*100; else print 0}' || echo 0)",
    "  GPU_PCT=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 || echo -1)",
    "  GPU_MEM=$(nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | awk -F', ' '{if($2>0) printf \"%.0f\", $1/$2*100; else print -1}' || echo -1)",
    '',
    '  # Ensure numeric defaults (empty breaks JSON)',
    '  : "${CPU_PCT:=0}"',
    '  : "${MEM_PCT:=0}"',
    '  : "${GPU_PCT:=-1}"',
    '  : "${GPU_MEM:=-1}"',
    '',
    '  curl -sf "$SERVER_URL/api/devices/$DEVICE_ID/heartbeat" \\',
    '    -X POST -H "Content-Type: application/json" \\',
    '    -H "X-Device-Token: $DEVICE_TOKEN" \\',
    '    -d "{\\"hostname\\": \\"$HN\\", \\"osInfo\\": \\"$OSINFO\\", \\"localUser\\": \\"$LUSER\\", \\"idleSeconds\\": 0, \\"sessionActive\\": false, \\"ipAddress\\": \\"$IP\\", \\"cpuPercent\\": $CPU_PCT, \\"memPercent\\": $MEM_PCT, \\"gpuPercent\\": $GPU_PCT, \\"gpuMemPercent\\": $GPU_MEM, \\"gpuName\\": \\"$GNAME\\"}" \\',
    '    > /dev/null 2>&1',
    '',
    '  if [ $? -eq 0 ]; then',
    '    echo "$(date +%H:%M:%S) heartbeat ok"',
    '  else',
    '    echo "$(date +%H:%M:%S) heartbeat FAILED"',
    '  fi',
    '  sleep "$INTERVAL"',
    'done',
  ];
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const platformUrl = `${proto}://${host}`;
  const hb = heartbeatScript();

  const script = `#!/bin/sh

PLATFORM_URL="\${PLATFORM_URL:-${platformUrl}}"
ENROLL_TOKEN="\${ENROLL_TOKEN:?ENROLL_TOKEN environment variable is required}"
CONFIG_DIR="\$HOME/.devicepool"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       Device Pool — Add Device       ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

OS_TYPE="linux"
if [ "\$(uname)" = "Darwin" ]; then OS_TYPE="macos"; fi
ARCH="\$(uname -m)"
MY_HOSTNAME="\$(hostname)"
# Get IP: Linux (hostname -I), macOS (route + ipconfig)
IP_ADDR="\$(hostname -I 2>/dev/null | awk '{print \$1}')"
if [ -z "\$IP_ADDR" ]; then
  IFACE="\$(route -n get default 2>/dev/null | awk '/interface:/{print \$2}')"
  [ -n "\$IFACE" ] && IP_ADDR="\$(ipconfig getifaddr "\$IFACE" 2>/dev/null)"
  [ -z "\$IP_ADDR" ] && IP_ADDR="\$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '')"
fi
# Detect GPU: NVIDIA (nvidia-smi), Apple (system_profiler), or empty
GPU_NAME="\$(nvidia-smi --query-gpu=gpu_name --format=csv,noheader 2>/dev/null | head -1 || echo '')"
if [ -z "\$GPU_NAME" ]; then
  GPU_NAME="\$(system_profiler SPDisplaysDataType 2>/dev/null | grep -i 'chip' | head -1 | sed 's/.*: *//' || echo '')"
fi

echo "  Device:   \$MY_HOSTNAME"
echo "  GPU:      \${GPU_NAME:-not detected}"
echo "  OS:       \$OS_TYPE (\$ARCH)"
echo "  IP:       \$IP_ADDR"
echo "  Platform: \$PLATFORM_URL"
echo ""

# Ask for SSH credentials
printf "  SSH username: " > /dev/tty
IFS= read -r SSH_USER < /dev/tty
printf "  SSH password: " > /dev/tty
IFS= read -r SSH_PASS < /dev/tty
echo ""
echo ""

echo "  Registering..."

# Use -s (silent) but NOT -f (fail) so we can read the response body on errors
DISPLAY_NAME="\${GPU_NAME:-\$MY_HOSTNAME}"

RESP=\$(curl -s -w "\\n%{http_code}" "\$PLATFORM_URL/api/enrollment/register" \\
  -X POST -H "Content-Type: application/json" \\
  -d "{\\"token\\": \\"\$ENROLL_TOKEN\\", \\"hostname\\": \\"\$MY_HOSTNAME\\", \\"displayName\\": \\"\$DISPLAY_NAME\\", \\"osType\\": \\"\$OS_TYPE\\", \\"architecture\\": \\"\$ARCH\\", \\"ipAddress\\": \\"\$IP_ADDR\\", \\"sshUsername\\": \\"\$SSH_USER\\", \\"sshPassword\\": \\"\$SSH_PASS\\", \\"accessMethods\\": [{\\"method\\": \\"ssh\\", \\"port\\": 22}]}")

# Extract HTTP status code (last line) and body (everything else)
HTTP_CODE=\$(echo "\$RESP" | tail -1)
BODY=\$(echo "\$RESP" | sed '$ d')

if [ "\$HTTP_CODE" != "200" ] && [ "\$HTTP_CODE" != "201" ]; then
  echo ""
  echo "  ✗ Registration failed (HTTP \$HTTP_CODE)"
  # Try to extract error message
  ERR_MSG=\$(echo "\$BODY" | sed -n 's/.*"error":"\\([^"]*\\)".*/\\1/p')
  if [ -n "\$ERR_MSG" ]; then
    echo "  Error: \$ERR_MSG"
  else
    echo "  \$BODY"
  fi
  echo ""
  exit 1
fi

# Parse deviceId and deviceToken from response
DEVICE_ID=\$(echo "\$BODY" | sed -n 's/.*"deviceId":"\\([^"]*\\)".*/\\1/p')
DEVICE_TOKEN=\$(echo "\$BODY" | sed -n 's/.*"deviceToken":"\\([^"]*\\)".*/\\1/p')

if [ -z "\$DEVICE_ID" ] || [ -z "\$DEVICE_TOKEN" ]; then
  echo ""
  echo "  ✗ Could not parse server response"
  echo "  \$BODY"
  echo ""
  exit 1
fi

echo "  ✓ Registered (ID: \$DEVICE_ID)"

# Save config
mkdir -p "\$CONFIG_DIR" 2>/dev/null
if [ ! -d "\$CONFIG_DIR" ]; then
  echo "  ✗ Cannot create \$CONFIG_DIR — check disk space"
  echo "  Try: df -h \$HOME"
  exit 1
fi
cat > "\$CONFIG_DIR/config.json" <<CONF
{
  "serverUrl": "\$PLATFORM_URL",
  "deviceId": "\$DEVICE_ID",
  "deviceToken": "\$DEVICE_TOKEN"
}
CONF
chmod 600 "\$CONFIG_DIR/config.json"
echo "  ✓ Config saved to \$CONFIG_DIR/config.json"

# Create heartbeat script
cat > "\$CONFIG_DIR/heartbeat.sh" <<'HBEOF'
${hb}
HBEOF
chmod +x "\$CONFIG_DIR/heartbeat.sh"

# Kill any existing heartbeat
pkill -f "devicepool.*heartbeat" 2>/dev/null || true
sleep 1

# ── Install persistent service (survives reboots) ───────────────────────────
if [ "\$(uname)" = "Linux" ]; then
  SVC_DIR="\$HOME/.config/systemd/user"
  mkdir -p "\$SVC_DIR"
  cat > "\$SVC_DIR/devicepool-agent.service" <<SVCEOF
[Unit]
Description=Device Pool Heartbeat Agent
After=network-online.target

[Service]
Type=simple
ExecStart=\$CONFIG_DIR/heartbeat.sh
Restart=always
RestartSec=30
StandardOutput=append:\$CONFIG_DIR/agent.log
StandardError=append:\$CONFIG_DIR/agent.log

[Install]
WantedBy=default.target
SVCEOF
  # Enable for boot (may fail silently if no user session yet — that's OK)
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable devicepool-agent 2>/dev/null || true
  loginctl enable-linger "\$(whoami)" 2>/dev/null || true
  echo "  ✓ Systemd user service installed (auto-starts on reboot)"
  # Try to start via systemd; fall back to nohup for this session
  if ! systemctl --user start devicepool-agent 2>/dev/null; then
    nohup "\$CONFIG_DIR/heartbeat.sh" >> "\$CONFIG_DIR/agent.log" 2>&1 &
    AGENT_PID=\$!
    disown \$AGENT_PID 2>/dev/null || true
    echo "  ✓ Heartbeat agent started now (PID: \$AGENT_PID)"
  fi
else
  # macOS — use cron @reboot + start immediately
  ( crontab -l 2>/dev/null | grep -v "devicepool"; echo "@reboot \$CONFIG_DIR/heartbeat.sh >> \$CONFIG_DIR/agent.log 2>&1" ) | crontab - 2>/dev/null || true
  echo "  ✓ Cron @reboot entry added (auto-starts on reboot)"
  nohup "\$CONFIG_DIR/heartbeat.sh" >> "\$CONFIG_DIR/agent.log" 2>&1 &
  AGENT_PID=\$!
  disown \$AGENT_PID 2>/dev/null || true
  echo "  ✓ Heartbeat agent started (PID: \$AGENT_PID)"
fi

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║            Setup Complete!           ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
echo "  Your device will appear on the dashboard"
echo "  within 30 seconds."
echo ""
echo "  Log:  tail -f \$CONFIG_DIR/agent.log"
echo ""
`;

  return new Response(script, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
