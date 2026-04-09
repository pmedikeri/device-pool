import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const platformUrl = `${proto}://${host}`;

  // Inline the entire new heartbeat script directly — no extraction needed
  const script = `#!/bin/sh
# Device Pool — Update heartbeat agent
CONFIG_DIR="\$HOME/.devicepool"

if [ ! -f "\$CONFIG_DIR/config.json" ]; then
  echo "ERROR: No config at \$CONFIG_DIR/config.json — run enrollment first"
  exit 1
fi

echo "Updating heartbeat agent..."

# Kill old heartbeat
pkill -f "\\.devicepool/heartbeat" 2>/dev/null || true
sleep 1

# Write new heartbeat script
cat > "\$CONFIG_DIR/heartbeat.sh" << 'HBSCRIPT'
#!/bin/sh
CONFIG_DIR="\$HOME/.devicepool"
CONFIG_FILE="\$CONFIG_DIR/config.json"
INTERVAL="\${1:-30}"

if [ ! -f "\$CONFIG_FILE" ]; then exit 1; fi

SERVER_URL=\$(sed -n 's/.*"serverUrl" *: *"\\([^"]*\\)".*/\\1/p' "\$CONFIG_FILE")
DEVICE_ID=\$(sed -n 's/.*"deviceId" *: *"\\([^"]*\\)".*/\\1/p' "\$CONFIG_FILE")
DEVICE_TOKEN=\$(sed -n 's/.*"deviceToken" *: *"\\([^"]*\\)".*/\\1/p' "\$CONFIG_FILE")

echo "Device Pool Agent (v2)"
echo "  Device: \$DEVICE_ID"
echo "  Server: \$SERVER_URL"
echo ""

trap '' HUP  # ignore hangup signal

while true; do
  HN=\$(hostname)
  OSINFO="\$(uname -s) \$(uname -m)"
  LUSER=\$(who 2>/dev/null | head -1 | awk '{print \$1}')
  [ -z "\$LUSER" ] && LUSER=\$(whoami 2>/dev/null)
  IP=\$(hostname -I 2>/dev/null | awk '{print \$1}')
  if [ -z "\$IP" ]; then
    # macOS: get the IP of the default route interface
    IFACE=\$(route -n get default 2>/dev/null | awk '/interface:/{print \$2}')
    [ -n "\$IFACE" ] && IP=\$(ipconfig getifaddr "\$IFACE" 2>/dev/null)
    [ -z "\$IP" ] && IP=\$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
  fi

  GNAME=\$(nvidia-smi --query-gpu=gpu_name --format=csv,noheader 2>/dev/null | head -1 || echo "")
  [ -z "\$GNAME" ] && GNAME=\$(system_profiler SPDisplaysDataType 2>/dev/null | grep -i 'chip' | head -1 | sed 's/.*: *//' || echo "")

  if [ -f /proc/stat ]; then
    C1=\$(awk '/^cpu /{print \$2+\$3+\$4+\$5+\$6+\$7+\$8}' /proc/stat)
    I1=\$(awk '/^cpu /{print \$5}' /proc/stat)
    sleep 1
    C2=\$(awk '/^cpu /{print \$2+\$3+\$4+\$5+\$6+\$7+\$8}' /proc/stat)
    I2=\$(awk '/^cpu /{print \$5}' /proc/stat)
    CPU_PCT=\$(echo "\$C1 \$C2 \$I1 \$I2" | awk '{d=\$2-\$1; i=\$4-\$3; if(d>0) printf "%.0f", 100*(d-i)/d; else print 0}')
  else
    # macOS: use top
    CPU_PCT=\$(top -l 1 -n 0 2>/dev/null | awk '/CPU usage/{gsub(/%/,""); print 100-\$7}' || echo 0)
  fi
  # Memory: Linux (free) or macOS (vm_stat)
  MEM_PCT=\$(free 2>/dev/null | awk '/Mem:/{printf "%.0f", \$3/\$2*100}')
  if [ -z "\$MEM_PCT" ]; then
    MEM_PCT=\$(vm_stat 2>/dev/null | awk '/Pages (active|wired)/{s+=\$NF} /Pages free/{f=\$NF} END{if(s+f>0) printf "%.0f", s/(s+f)*100; else print 0}' || echo 0)
  fi
  GPU_PCT=\$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 || echo -1)
  GPU_MEM=\$(nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | awk -F', ' '{if(\$2>0) printf "%.0f", \$1/\$2*100; else print -1}' || echo -1)

  # Ensure numeric defaults (empty string breaks JSON)
  : "\${CPU_PCT:=0}"
  : "\${MEM_PCT:=0}"
  : "\${GPU_PCT:=-1}"
  : "\${GPU_MEM:=-1}"

  curl -sf "\$SERVER_URL/api/devices/\$DEVICE_ID/heartbeat" \\
    -X POST -H "Content-Type: application/json" \\
    -H "X-Device-Token: \$DEVICE_TOKEN" \\
    -d "{\\"hostname\\": \\"\$HN\\", \\"osInfo\\": \\"\$OSINFO\\", \\"localUser\\": \\"\$LUSER\\", \\"idleSeconds\\": 0, \\"sessionActive\\": false, \\"ipAddress\\": \\"\$IP\\", \\"cpuPercent\\": \$CPU_PCT, \\"memPercent\\": \$MEM_PCT, \\"gpuPercent\\": \$GPU_PCT, \\"gpuMemPercent\\": \$GPU_MEM, \\"gpuName\\": \\"\$GNAME\\"}" \\
    > /dev/null 2>&1

  if [ \$? -eq 0 ]; then
    echo "\$(date +%H:%M:%S) ok"
  else
    echo "\$(date +%H:%M:%S) FAIL"
  fi
  sleep "\$INTERVAL"
done
HBSCRIPT
chmod +x "\$CONFIG_DIR/heartbeat.sh"

# Start (nohup + disown to survive terminal close on macOS)
nohup "\$CONFIG_DIR/heartbeat.sh" > "\$CONFIG_DIR/agent.log" 2>&1 &
AGENT_PID=\$!
disown \$AGENT_PID 2>/dev/null || true
echo "Done! PID: \$AGENT_PID"
echo "GPU name will appear on dashboard in ~30 seconds."
`;

  return new Response(script, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
