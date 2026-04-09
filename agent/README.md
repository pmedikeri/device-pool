# Device Pool Agent

A lightweight Go agent that registers with the Device Pool platform and sends periodic heartbeats.

## Build

```bash
cd agent
go build -o devicepool-agent .
```

## Usage

### Register a new device

```bash
sudo ./devicepool-agent \
  --server https://pool.example.com \
  --token BOOTSTRAP_TOKEN
```

This calls the enrollment API, receives a device ID and token, and writes them
to `/etc/devicepool/agent.json` (or the path given by `--config`).

### Run the agent

```bash
sudo ./devicepool-agent --server https://pool.example.com
```

The agent loads its config file and begins sending heartbeats every 30 seconds
(adjustable with `--interval`).

### Flags

| Flag         | Default                       | Description                        |
|--------------|-------------------------------|------------------------------------|
| `--server`   | (none)                        | Platform URL                       |
| `--token`    | (none)                        | Bootstrap token for registration   |
| `--config`   | `/etc/devicepool/agent.json`  | Path to agent config file          |
| `--interval` | `30`                          | Heartbeat interval in seconds      |

## Systemd unit file

Create `/etc/systemd/system/devicepool-agent.service`:

```ini
[Unit]
Description=Device Pool Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/devicepool-agent --server https://pool.example.com
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
```

Then enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now devicepool-agent
```

## Cross-compilation

Build for Linux arm64 (e.g. DGX Spark):

```bash
GOOS=linux GOARCH=arm64 go build -o devicepool-agent-linux-arm64 .
```

Build for Linux amd64:

```bash
GOOS=linux GOARCH=amd64 go build -o devicepool-agent-linux-amd64 .
```

No CGo or external dependencies are used, so cross-compilation works out of
the box.

## Config file format

The agent config file (`/etc/devicepool/agent.json`) is created during
registration and looks like:

```json
{
  "serverUrl": "https://pool.example.com",
  "deviceId": "abc123",
  "deviceToken": "secret-device-token"
}
```

The file is written with `0600` permissions.
