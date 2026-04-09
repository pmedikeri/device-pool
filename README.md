# Device Pool

Internal platform for sharing devices (Linux, macOS, Windows) across a team. Users can see device availability, reserve a device, and get SSH credentials to connect — all from a single web page.

## Quick Start (Docker)

### Prerequisites
- Docker & Docker Compose

### Deploy

```bash
git clone <repo-url> device-pool
cd device-pool

# Start everything (PostgreSQL + app)
docker compose up -d --build

# Wait for healthy status
docker compose ps

# Push database schema
docker compose exec app npx prisma db push --accept-data-loss

# Open in browser
echo "Open http://$(hostname -I | awk '{print $1}'):3000"
```

### First Login

Open `http://<your-server-ip>:3000` in a browser.

- Enter your name and the access password: `testing123`
- You're in — no account setup needed

### Add a Device

1. Click **+ Add Device** in the top right
2. Click **Generate Bootstrap Token**
3. Copy the command shown
4. SSH into the target device and paste it
5. It will ask for the SSH username and password for that device
6. Device appears on the dashboard within 30 seconds with live CPU/MEM/GPU stats

### Use a Device

1. Click **Reserve** on an available device (reserves for 2 hours)
2. Click **Connect** — SSH command is copied to your clipboard
3. Paste in your terminal to SSH in
4. Click **Release** when done

## Architecture

```
Browser → Next.js App (port 3000) → PostgreSQL (port 5432)
                                   ↑
Target Devices → Heartbeat Agent (curl-based, no install)
```

- **Web app**: Next.js + TypeScript + Tailwind + Prisma
- **Database**: PostgreSQL
- **Device agent**: Shell script (auto-generated during enrollment, no build needed)
- **Auth**: Shared password gate (`testing123` by default)

## Configuration

Environment variables in `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `SITE_PASSWORD` | `testing123` | Access password for the web UI |
| `CREDENTIAL_KEY` | (generated) | AES-256 key for encrypting SSH passwords |
| `HEARTBEAT_STALE_SECONDS` | `120` | Seconds before a device is marked offline |
| `MAX_RESERVATION_HOURS` | `24` | Maximum reservation duration |

To change the site password, edit `docker-compose.yml` and add:
```yaml
SITE_PASSWORD: "your-new-password"
```

## Device Features

- **Live metrics**: CPU, Memory, GPU utilization (updated every 30s)
- **Auto IP update**: If a device's IP changes, the heartbeat updates it automatically
- **SSH credentials**: Stored encrypted (AES-256-GCM) in the database
- **Reservation system**: Reserve → Connect → Release flow

## Commands

```bash
# Start
docker compose up -d --build

# View logs
docker compose logs -f app

# Restart after code changes
docker compose up -d --build app

# Stop
docker compose down

# Stop and delete all data
docker compose down -v

# Re-seed sample data (optional)
docker compose exec app npx tsx prisma/seed.ts
```

## Project Structure

```
device-pool/
├── src/
│   ├── app/                 # Next.js pages + API routes
│   │   ├── page.tsx         # Main dashboard (device list)
│   │   ├── admin/           # Add device page
│   │   ├── login/           # Login page
│   │   └── api/             # REST API
│   ├── components/          # React components
│   └── lib/
│       ├── services/        # Business logic
│       ├── crypto.ts        # AES-256 encryption
│       ├── auth.ts          # Auth helpers
│       └── errors.ts        # Error classes
├── prisma/
│   └── schema.prisma        # Database schema
├── e2e/                     # Playwright E2E tests
├── docker-compose.yml
├── Dockerfile
└── SECURITY.md
```
