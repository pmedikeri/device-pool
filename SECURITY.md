# Security — Device Pool v1

## Threat Model

### Assets
- **Device credentials**: tokens used by agents to authenticate heartbeats
- **User sessions**: authenticated browser sessions
- **Reservation state**: who has access to which device and when
- **Audit log**: tamper-evident record of all actions
- **Device access**: SSH/RDP connections to managed devices

### Threat Actors
1. **Malicious insider**: authenticated user trying to access devices they shouldn't
2. **Compromised agent**: device agent token leaked or device compromised
3. **Network attacker**: intercepting traffic between components

### Trust Boundaries
1. **Browser → API**: authenticated via session cookie / dev header
2. **Agent → API**: authenticated via device token
3. **API → Guacamole**: internal network, platform controls connection creation
4. **API → PostgreSQL**: internal network, password auth

## Security Controls

### Authentication
- User auth via Auth.js (SSO-ready stub). Dev mode uses x-user-id header.
- Device auth via bearer token issued at enrollment, stored hashed (bcrypt).
- Bootstrap tokens are short-lived (15 min), one-time use.

### Authorization
- RBAC with three roles: `user`, `admin`, `auditor`
- Users can only manage their own reservations
- Admin required for: device enrollment, maintenance mode, revocation, reservation override
- Auditor can read audit logs but not modify state
- Connect requires active reservation OR admin override

### Data Protection
- No plaintext passwords stored. User passwords hashed with bcrypt.
- Device tokens hashed with bcrypt.
- Bootstrap tokens stored as hex (short-lived, deleted after use).
- Fallback password enrollment: credentials used in-memory only, never persisted.

### Audit
- All state-changing operations produce append-only audit events
- Events include: who, what, when, target entity, details
- No audit event deletion API exists

### Input Validation
- All API inputs validated with Zod schemas
- SQL injection prevented by Prisma ORM parameterized queries
- XSS prevented by React's default escaping

### Session Security
- Session cookies should be HttpOnly, Secure, SameSite=Lax (when Auth.js is configured)
- CSRF protection via SameSite cookies and origin checking

## Accepted Risks (v1)

| Risk | Mitigation | Accepted Because |
|------|-----------|-----------------|
| Dev mode uses x-user-id header (spoofable) | Replace with Auth.js in production | Dev convenience; not deployed to production |
| No TLS enforcement between internal services | Deploy behind reverse proxy with TLS | Internal network assumption for v1 |
| Guacamole admin credentials in env vars | Use secrets manager in production | Acceptable for local dev |
| No rate limiting on heartbeat endpoint | Agent tokens are device-specific | Low abuse potential; add rate limiting if needed |
| Device token rotation not implemented | Re-enrollment path exists | Acceptable for small fleet |
| No MFA | SSO provider handles MFA | Delegated to identity provider |

## Future Improvements

1. **Auth.js / SSO integration** — replace dev header auth with proper session management
2. **mTLS between services** — encrypt internal traffic
3. **Device certificate identity** — replace bearer tokens with X.509 certificates
4. **Rate limiting** — on all public-facing endpoints
5. **Token rotation** — periodic device token rotation without re-enrollment
6. **Secrets manager** — move all credentials to Vault/AWS SM
7. **Network segmentation** — isolate Guacamole in DMZ
8. **Audit log integrity** — hash chain or external log shipping
9. **Session recording** — integrate Guacamole session recording for compliance
10. **Anomaly detection** — alert on unusual access patterns
