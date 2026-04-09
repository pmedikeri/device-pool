# Device Pool — Architecture

## Overview

Device Pool is an internal platform for discovering, reserving, and connecting to shared devices (Linux, macOS, Windows). It replaces ad-hoc Slack-based access requests with a structured booking and access-control system.

## Major Components

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Next.js)                     │
│  Device Catalog │ Reservations │ Admin │ Enrollment UI   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│                  Next.js API Routes                      │
│  /api/devices  /api/reservations  /api/sessions          │
│  /api/admin    /api/enrollment    /api/auth               │
│                                                          │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐ │
│  │ Reservation │ │ Access Broker│ │ Enrollment        │ │
│  │ Engine      │ │ (Guac Adapter│ │ Service           │ │
│  └─────────────┘ └──────────────┘ └───────────────────┘ │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐ │
│  │ Device      │ │ Audit        │ │ Auth / RBAC       │ │
│  │ Service     │ │ Service      │ │                   │ │
│  └─────────────┘ └──────────────┘ └───────────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌───────────┐ ┌──────────┐ ┌──────────────┐
   │ PostgreSQL│ │ Guacamole│ │ Device Agent │
   │           │ │ (guacd)  │ │ (on device)  │
   └───────────┘ └──────────┘ └──────────────┘
```

### 1. Web Frontend (Next.js + TypeScript + Tailwind)
Single Next.js app serving both UI and API routes (modular monolith). Pages for device catalog, reservation management, admin controls, and enrollment.

### 2. API Layer (Next.js API Routes)
RESTful API routes organized by domain. All business logic lives in service modules under `src/lib/services/`. API routes are thin — they validate input, call services, return responses.

### 3. Domain Services
- **DeviceService** — CRUD, status derivation, heartbeat processing
- **ReservationEngine** — lease creation, overlap prevention, state transitions, grace period enforcement
- **AccessBroker** — authorization check, Guacamole session creation via adapter
- **EnrollmentService** — bootstrap token generation, device registration, credential exchange
- **AuditService** — append-only event logging
- **AuthService** — session management, RBAC enforcement

### 4. PostgreSQL Database
Single database, Prisma ORM. All state lives here — no Redis needed for v1.

### 5. Apache Guacamole (Connection Broker)
Guacamole handles the actual remote desktop/SSH transport. Device Pool controls *authorization* — Guacamole only sees connections that Device Pool explicitly creates. Guacamole-specific code is isolated behind `GuacamoleAdapter`.

### 6. Device Agent (Go)
Lightweight daemon installed on managed devices. Registers with bootstrap token, sends periodic heartbeats, reports system info. Heartbeat-only for v1 — no inbound command execution.

## Trust Boundaries

```
┌─ Trust Boundary 1: Platform ─────────────────────────┐
│  Next.js App ←→ PostgreSQL                           │
│  (authenticated users, RBAC-enforced)                │
└──────────────────────────────────────────────────────┘
        │                          │
        ▼                          ▼
┌─ Boundary 2: Broker ──┐  ┌─ Boundary 3: Devices ────┐
│  Guacamole (guacd)     │  │  Device Agent             │
│  - Platform creates    │  │  - Authenticates with      │
│    connections          │  │    device token            │
│  - guacd never talks   │  │  - Reports only, no        │
│    to platform DB       │  │    inbound commands v1     │
│  - Short-lived creds   │  │  - Runs as service account │
└────────────────────────┘  └───────────────────────────┘
```

**Key boundaries:**
1. **Users ↔ Platform**: Auth.js session, RBAC roles (user/admin/auditor). All API routes validate session + role.
2. **Platform ↔ Guacamole**: Platform writes connection configs to Guacamole's DB or API. guacd never queries platform state. Short-lived connection tokens.
3. **Platform ↔ Devices**: Devices authenticate via device tokens issued at enrollment. Agents push data in (heartbeats); platform never SSHes into devices for management.

## Core Flows

### Enrollment Flow
```
1. Admin/Owner clicks "Enroll Device" in UI
2. Platform generates short-lived bootstrap token (expires in 15 min)
3. UI shows a one-liner:
   - Linux/macOS: curl ... | sh (installs agent, registers device)
   - Windows: PowerShell command (installs agent, registers device)
4. Agent calls POST /api/enrollment/register with bootstrap token + system info
5. Platform validates token, creates Device record, issues long-lived device token
6. Agent stores device token, begins heartbeat loop
7. Audit event: enrollment_created, device_registered
```

### Reservation Flow
```
1. User browses device catalog, finds available device
2. User clicks "Reserve", picks time window
3. POST /api/reservations — engine validates:
   - Time window is valid (future, within max duration)
   - No overlapping active reservation
   - Device not in maintenance mode
   - Device is online (unless admin override)
4. Reservation created with status=pending (or active if starts now)
5. Check-in deadline set (e.g., start + 10 min grace)
6. If user doesn't connect by deadline → status=no_show, device freed
7. Audit event: reservation_created
```

### Connect Flow
```
1. User clicks "Connect" on device with active reservation
2. POST /api/sessions/connect
3. Platform checks:
   - User has active reservation for this device, OR
   - User is admin with override permission
4. Platform creates Guacamole connection config:
   - SSH for Linux/macOS
   - RDP for Windows
5. Platform returns broker URL (Guacamole client URL with token)
6. User's browser opens Guacamole web client
7. Session record created, audit event: connect_granted
8. On disconnect: session.endedAt set, audit event logged
```

### Audit Flow
All state-changing operations append to the AuditEvent table:
- **Who**: userId (or "system" for automated transitions)
- **What**: event type (enrollment_created, reservation_created, connect_granted, etc.)
- **When**: timestamp
- **Target**: deviceId, reservationId, sessionId as applicable
- **Details**: JSON blob with relevant context

Audit events are append-only. No deletes. Auditor role can read all events.

## Device State Model

Device state is **derived**, not stored as a single field. It's computed from:

```
deviceStatus = f(heartbeat, reservationState, sessionState, maintenanceMode)

                    ┌──────────────┐
                    │   enrolled   │ (just registered, no heartbeat yet)
                    └──────┬───────┘
                           │ first heartbeat
                    ┌──────▼───────┐
              ┌─────│   online     │─────┐
              │     └──────┬───────┘     │
              │            │             │
     ┌────────▼──┐  ┌──────▼─────┐  ┌───▼──────────┐
     │ available │  │  reserved  │  │ maintenance  │
     └───────────┘  └──────┬─────┘  └──────────────┘
                           │
                    ┌──────▼───────┐
                    │   in_use     │ (active session)
                    └──────────────┘

   If no heartbeat for >2 min:
                    ┌──────────────┐
                    │   offline    │
                    └──────────────┘
```

**Composite status derivation:**
- `offline` — lastHeartbeatAt older than threshold (120s)
- `maintenance` — maintenanceMode = true
- `in_use` — active session exists
- `reserved` — active reservation exists, no session yet
- `available` — online, no reservation, no maintenance
- `enrolled` — registered but never sent heartbeat

## Reservation / Lease State Model

```
┌─────────┐   start time    ┌────────┐   user connects   ┌───────────┐
│ pending │ ───────────────► │ active │ ─────────────────► │ completed │
└────┬────┘                  └───┬────┘                    └───────────┘
     │                           │
     │ user cancels              │ grace period expires
     ▼                           ▼
┌──────────┐              ┌──────────┐
│ canceled │              │ no_show  │
└──────────┘              └──────────┘
                                │
     ┌──────────┐               │ end time passes
     │ expired  │◄──────────────┘ (or from active)
     └──────────┘

Admin can force-cancel any reservation → canceled (with overrideByUserId set)
```

**States:**
| State | Meaning |
|-------|---------|
| `pending` | Reservation created for future time window |
| `active` | Current time is within reservation window |
| `completed` | User connected and reservation ended normally |
| `canceled` | User or admin canceled before use |
| `no_show` | Grace period expired without user connecting |
| `expired` | Reservation window ended without completion |

## Key Security Decisions

1. **No plaintext passwords stored.** Bootstrap credentials (fallback mode) are encrypted in transit and never persisted. Device tokens are bcrypt-hashed.
2. **Bootstrap tokens are short-lived** (15 min default). One-time use. Bound to the creating user.
3. **Device auth is token-based**, not password-based. Agent authenticates with a device token issued at enrollment.
4. **Platform owns authorization.** Guacamole is a transport layer only. The platform decides who can connect to what.
5. **Audit everything.** All state changes produce audit events. Append-only table.
6. **RBAC with three roles**: `user` (book/connect), `admin` (manage devices, override), `auditor` (read audit logs).
7. **Session tokens for users** via Auth.js with secure cookie settings.
8. **No agent inbound commands in v1.** Agents only push heartbeats — reduces attack surface.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Modular monolith (single Next.js app) | Simpler deployment, but tighter coupling than microservices |
| Prisma ORM | Great DX, but less control over complex queries |
| No Redis for v1 | Simpler infra, but reservation locking uses DB-level locks |
| Guacamole for remote access | Proven technology, but adds operational complexity |
| Go for agent | Cross-platform static binary, but team needs Go knowledge |
| Heartbeat-only agent | Smaller attack surface, but no remote remediation |

## Assumptions (v1)

1. Fewer than 200 devices and 50 concurrent users.
2. Single-site deployment (no multi-region).
3. Users have corporate SSO — Auth.js stub is sufficient.
4. Devices are on a reachable network from Guacamole.
5. Guacamole is pre-deployed or deployed via Docker Compose.
6. One reservation per device at a time (no multi-seat devices).
7. Manual device enrollment is acceptable; bulk import is a future feature.

## Non-Goals (v1)

- Automated device discovery / network scanning
- Multi-region / federated deployments
- Device configuration management (Ansible, Puppet, etc.)
- Usage billing or chargeback
- Mobile app
- Queue / waitlist for busy devices
- Recurring reservations
- Tag-based reservation (exact device only)
- Device groups / pools with load balancing
- File transfer through the platform
- Chat / collaboration features
