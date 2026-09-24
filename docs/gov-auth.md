# Government Panel Authentication — Architecture & Operations

> Cyber-Sakhi Government Console (`/gov`). Production-oriented demo for SIH:
> real controls, no mock security. **Not certified for real government
> deployment** — that requires an independent security review, HSM-backed
> secrets, and authorized infrastructure.

## 1. Architecture

| Layer | Implementation |
|---|---|
| Identifier | Officer ID `SS-DDD-NNNN` (primary) or official email (fallback) — `lib/gov/govOfficerCode.ts`, `lib/gov/govAuth.ts` |
| Passwords | bcrypt cost 12, per-account lockout (5 fails / 15 min), timing-equalized generic errors — `lib/gov/govCredentials.ts` |
| Throttling | In-memory sliding window: login 30/IP/15min, MFA 10/officer/15min, recovery 10/IP/15min — `lib/gov/govRateLimit.ts` (single-instance; multi-instance needs a shared store) |
| MFA | Google Authenticator TOTP (SHA-1, 30 s, 6 digits, ±1 window), AES-256-GCM secrets, single-use hashed recovery codes — `lib/gov/govTotp.ts`, `lib/gov/govMfaEnrollment.ts` |
| Sessions | Opaque 256-bit token, SHA-256 hash stored, 12 h absolute / 8 h idle TTL, rotation, `session_version` invalidation — `lib/gov/govSession.ts` |
| Cookie | `__Secure-gov-session`, `Path=/gov`, HttpOnly, always Secure, SameSite=Lax |
| Recovery | Generic-response Forgot ID / Forgot Password, 30-min single-use hashed tokens, admin-issued links — `lib/gov/govAccountRecovery.ts` |
| Authorization | Session → role permission → jurisdiction scope → assignment/grant → tiers, all server-side — `lib/gov/govGuard.ts`, `govAuthorization.ts`, `govPermissions.ts`, `govScope.ts` |
| Audit | Mandatory fail-closed events, secret-scrubbed payloads — `lib/gov/govAudit.ts`, `govAuditPersistence.ts` (table `audit_logs`) |

### Login flow (two-step UX, one server exchange)

1. Officer enters **Officer ID + password** → Continue.
2. Officer enters **6-digit authenticator code** (or a single-use **recovery code**) → Verify & Sign In.
3. Server: resolves identifier → generic-fail on unknown/inactive/locked → bcrypt →
   issues a **temporary password-only session** → verifies second factor →
   **revokes the temp session on any MFA failure** → completes MFA →
   writes mandatory `auth.login_succeeded` audit → sets the session cookie →
   redirects to `/gov/dashboard`.

A password-only session cookie is **never** sent to the browser. MFA is
verified server-side only; recovery codes are consumed atomically.

### Officer ID format (`SS-DDD-NNNN`, e.g. `DL-CYB-0001`)

Defined centrally in `lib/gov/govOfficerCode.ts`. `SS` is a jurisdiction
*hint* (36 states/UTs + `DEMO`); authority always comes from the
`gov_officers` row. Legacy `GOV-…` codes keep working for existing accounts.

### Roles (least-privilege defaults in `lib/gov/govPermissions.ts`)

`SUPER_ADMIN`, `STATE_ADMIN`, `DISTRICT_OFFICER`, `INVESTIGATOR`, `ANALYST`
(de-identified intelligence only — the SIH demo role), `AUDITOR`
(read-only oversight). A role selected/shown in UI never grants authority;
every request re-checks the database row.

## 2. Database

Apply in Supabase SQL Editor, in order:

1. Existing: `gov_identity_sessions.sql`, `gov_admin_panel_schema.sql`,
   `gov_audit_extension.sql`, `gov_totp_mfa.sql`, `gov_assignments_grants.sql`
2. **New:** `gov_mfa_enrollment_recovery.sql` (pending-enrollment columns,
   `gov_recovery_codes`, `gov_password_resets`, purge function)

All migrations are additive/idempotent, service-role-only (FORCE RLS).

## 3. Environment (names only — values live in `.env.local`, never in git)

| Name | Purpose |
|---|---|
| `GOV_MFA_ENCRYPTION_KEY` | **Required.** 32-byte base64; encrypts TOTP secrets. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server data access (scripts + server lib) |
| `NEXT_PUBLIC_APP_URL` | Reset-link base URL (default `http://localhost:3000`) |

Without `GOV_MFA_ENCRYPTION_KEY`, TOTP verification fails closed and **no
gov sign-in can succeed** — this is intentional. See `.env.example`.

## 4. SIH demo setup (run in PowerShell from the repo root)

```powershell
# 0. Encryption key (once) — put the output in .env.local as GOV_MFA_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 1. Apply migrations (Supabase SQL Editor), including gov_mfa_enrollment_recovery.sql

# 2. Create the demo officer (least-privilege ANALYST, DEMO jurisdiction)
$env:GOV_SEED_BOOTSTRAP="1"
$env:GOV_SEED_DEMO="1"
$env:GOV_SEED_EMAIL="demo.officer@gov.example"
$env:GOV_SEED_PASSWORD="<choose 12+ chars>"
$env:GOV_SEED_NAME="Demo Officer"
node scripts/seed-gov-officer.cjs   # prints code DEMO-CYB-0001

# 3. Provision its first authenticator (shown ONCE — scan into Google Authenticator)
$env:GOV_MFA_BOOTSTRAP="1"
$env:GOV_MFA_CODE="DEMO-CYB-0001"
node scripts/gov-enroll-mfa.cjs

# 4. Sign in at http://localhost:3000/gov/login
#    Step 1: DEMO-CYB-0001 + password → Step 2: 6-digit code → /gov/dashboard
```

Demo data lives under the `DEMO` jurisdiction, separated from real scopes.
MFA replacement afterwards happens at `/gov/mfa` (fresh session required).

### Disable / rotate the demo account

```sql
update gov_officers set status='REVOKED', session_version=session_version+1
where officer_code='DEMO-CYB-0001';
update gov_sessions set revoked_at=now(), revoke_reason='demo_disabled'
where officer_id=(select id from gov_officers where officer_code='DEMO-CYB-0001');
delete from gov_password_resets where officer_id=(select id from gov_officers where officer_code='DEMO-CYB-0001');
```

Rotate: re-run the seed with a new `GOV_SEED_PASSWORD` (bumps version,
kills sessions), then re-provision MFA.

## 5. Recovery operations

- **Forgot User ID** (`/gov/login/forgot-id`): generic reply, no oracle.
  Administrator verifies identity out-of-band and re-issues the Officer ID.
- **Forgot Password** (`/gov/login/forgot-password` → admin issues link →
  `/gov/login/reset-password?token=…`): 30-min single-use token; completion
  rotates the hash, clears lockout, and signs out **all** sessions.
- Admin issuance:
  ```powershell
  $env:GOV_RESET_BOOTSTRAP="1"; $env:GOV_RESET_CODE="DL-CYB-0001"
  node scripts/gov-issue-reset.cjs   # prints the one-time link
  ```

## 6. Google Authenticator setup (officers)

1. Install Google Authenticator; tap **+ → Enter a setup key**.
2. Scan the `/gov/mfa` QR code or paste the manual key (account shows as
   `Cyber-Sakhi-Gov:<OFFICER-ID>`).
3. Enter the current 6-digit code → **Verify & Activate**.
4. Store the 10 recovery codes offline (shown once; each works one time).

## 7. API reference (`/gov/api/*`, envelope `{error:{code,message}}`)

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/gov/api/login` | IP throttle | `{identifier,email?,password,mfaCode}` → session cookie |
| GET | `/gov/api/session` | session | Safe profile + `mfaFresh` |
| POST | `/gov/api/logout` | session (idempotent) | Revoke + clear cookie |
| GET | `/gov/api/mfa/status` | session | `none`/`pending`/`enabled` |
| POST | `/gov/api/mfa/enroll` | session (+fresh to replace) | Pending secret + `otpauthUrl` + manual key |
| POST | `/gov/api/mfa/confirm` | session | Activate factor, issue recovery codes (once) |
| POST | `/gov/api/recovery/forgot-id` | throttle | Generic reply |
| POST | `/gov/api/recovery/forgot-password` | throttle | Generic reply, token prepared |
| POST | `/gov/api/recovery/reset-password` | throttle | `{token,newPassword}` → rotate + logout-all |
| GET | `/gov/api/dashboard`, `/gov/api/dashboard/filters` | `case.view_meta` | Scoped metrics + filter options |
| GET | `/gov/api/cases`, `/gov/api/queue`, `/gov/api/trends`, `/gov/api/geo`, `/gov/api/indicators` | per-route permission | Scoped explorer, queue, analytics, geography, indicator search |
| GET/PATCH | `/gov/api/cases/[caseId]` | `case.view` / `case.update` + scope | Detail + triage update |
| GET/POST | `/gov/api/cases/[caseId]/{assignment,notes}` | `case.assign` / `case.note` | Assignment + notes |
| GET | `/gov/api/cases/[caseId]/{victim,location}` | `case.view_pii` + purpose + mandatory audit | PII + live locations |
| GET | `/gov/api/cases/[caseId]/evidence`, `/gov/api/evidence/[evidenceId]` | `evidence.list` / `evidence.view` | Evidence metadata |
| GET | `/gov/api/reports` (+POST export) | `report.generate` / `report.export` + ledger | Datasets + CSV/PDF export |
| GET | `/gov/api/audit` | `audit.view` | Audit log query |
| GET | `/gov/api/current-events`, `/gov/api/cyber-news` | none (public feeds) | I4C / news aggregation |

> Consolidation note: data routes previously lived under `/api/gov/*`, which
> browsers could not call with the `Path=/gov` session cookie. They now live
> under `/gov/api/*`; the old paths were removed (no shims, no rewrites).

## 8. Verification

```powershell
npm test -- tests/gov        # unit suite (officer ID, TOTP vectors, policy, login, recovery)
npx tsc --noEmit             # typecheck
npm run lint                 # eslint
npm run build                # production build
```

Manual checklist: valid login → dashboard; wrong password / unknown ID /
malformed ID / disabled account → identical generic error; 5 fails →
lockout; wrong TOTP → denied + temp session revoked; recovery code works
once; enrollment QR + confirm + codes shown once; replacement without fresh
MFA → 403; forgot flows → generic, no oracle; reset link → single use,
old sessions die; sidebar shows only permitted modules; logout → cookie
cleared, session revoked.

## 9. Known limitations (demo scope)

- Rate limiters are process-local (single instance); use a shared store
  (e.g. Redis/Upstash) for multi-instance deployments.
- No self-service delivery channel (email/SMS) for reset links or masked
  IDs — fulfillment is an administrator workflow by design here.
- Login is a single request carrying both factors (two-step UX); a
  persisted cross-request pre-auth token is a future hardening step. The
  security properties hold: no authorized cookie exists before MFA success.
- First-factor provisioning is an admin ceremony (`gov-enroll-mfa.cjs`);
  officers cannot self-enroll without an authenticated session.
- `GOV_MFA_ENCRYPTION_KEY` rotation procedure is manual (decrypt with old,
  re-encrypt with new — scripted rotation is future work).
- Not certified for real government deployment (see header).
