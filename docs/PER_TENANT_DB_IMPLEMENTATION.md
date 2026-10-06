# Per-Tenant Database Isolation - Implementation Summary

## Overview

Each family (tenant) now has complete control over their own database, ensuring maximum security and data isolation. This document summarizes the implementation and how to set it up.

## What Was Implemented

### 1. **Backend Infrastructure** (`apps/api/src`)

#### Core Files:
- **`lib/tenantDb.ts`** — Tenant database resolver supporting 3 modes:
  - `single` (legacy, all tenants share one DB)
  - `multi-db-same-uri` (shared cluster, different DB names per tenant)
  - `per-tenant-uri` (each tenant has dedicated connection string)

- **`lib/crypto.ts`** — AES-256-GCM encryption for storing connection strings at rest
  - Encrypts connection URIs before storage
  - Decrypts on-demand when connecting
  - Requires `DB_URI_ENCRYPTION_KEY` (base64-encoded 32 bytes)

- **`models/Tenant.ts`** — Extended with DB isolation fields:
  - `dbName` — Database name for multi-db-same-uri mode
  - `dbConnectionUri` — Encrypted connection string for dedicated mode
  - `dbIsolationMode` — 'shared' or 'dedicated'
  - `dbStatus` — 'pending', 'ready', or 'failed'
  - `dbMigratedAt` — Timestamp of last migration
  - `dbLastHealthAt` — Timestamp of last connectivity check

#### Routes (`routes/tenants.ts`):
- **`POST /tenants/import`** — Create tenant with optional DB isolation
  - Test connection before creating (unless `forceCreate` set)
  - Encrypt connection string before storing
  - Support `dbIsolationMode` and `dbConnectionUri`
  - Audit logging when `forceCreate` used

- **`PATCH /tenants/:id`** — Update tenant including DB connection
  - Validate new connection before updating
  - Support mode switching (shared ↔ dedicated)
  - Audit trail for all changes

- **`POST /tenants/test-connection`** — Validate MongoDB connection
  - In-memory rate limiting (6 req/60s per IP)
  - Returns `{ ok: true }` on success
  - Rate-limited to prevent abuse

- **`GET /tenants/status/db-isolation`** — Check isolation status
  - Returns status for all tenants
  - Shows mode, health, migration date
  - Super-admin only

- **`POST /tenants/:id/db-status/update`** — Health check endpoint
  - Verifies connectivity for dedicated connections
  - Updates `dbLastHealthAt` timestamp
  - Super-admin only

### 2. **Migration Tooling** (`apps/api/src/scripts`)

#### `migrateTenantsToSeperateDb.ts`
- Moves existing tenant data from shared DB to per-tenant DBs
- Handles 4 collections: Person, Event, JoinRequest, LineageVerification
- Batch processing (100 documents per batch)
- Skips already-migrated tenants
- Progress reporting and error handling
- Updates `dbMigratedAt` timestamp on completion

Run with:
```bash
npx ts-node apps/api/src/scripts/migrateTenantsToSeperateDb.ts
```

### 3. **Frontend UI** (`apps/web/src`)

#### ImportTenant.tsx (`pages/super-admin/ImportTenant.tsx`)
- **DB Isolation Mode selector** — Choose 'shared' or 'dedicated'
- **Connection String input** — For dedicated mode
- **Test Connection button** — Validates before import
- **Force-Create checkbox + modal** — Override connectivity test with confirmation
  - Requires typing "FORCE" to confirm
  - Logs to audit trail
  - Shows security warning

#### DbIsolationStatus.tsx (`pages/super-admin/DbIsolationStatus.tsx`)
- **Dashboard showing all tenants** — DB mode and status
- **Health check button** — Verify each tenant's connection
- **Arabic labels** — عزل قاعدة البيانات (DB Isolation)
- **Status badges** — ready (green), pending (yellow), failed (red)

#### API Client (`lib/api.ts`)
- `getDbIsolationStatus()` — Fetch all tenant DB statuses
- `updateTenantDbStatus(tenantId)` — Health check endpoint
- `testTenantDbConnection(uri)` — Validate connection string
- `importTenant(payload)` — Create with DB fields
- `encryptString` / `decryptString` — Encrypt connection URIs

### 4. **Documentation** (`docs`)

#### MULTI_TENANT_DB_SETUP.md
- **Quick start guide** — Set up in 5 steps
- **Environment variables reference** — All config options
- **Mode comparison** — When to use each mode
- **Troubleshooting** — Common issues and solutions
- **Rollback instructions** — How to revert if needed

## Enabling Per-Tenant DB Isolation

### Step 1: Set Environment Variables

```bash
# For multi-db-same-uri (recommended for most users)
TENANT_DB_MODE=multi-db-same-uri
TENANT_DB_PREFIX=qabila_tenant_
MONGO_URI=mongodb://localhost:27017/qabila

# For per-tenant-uri (each tenant on separate server)
TENANT_DB_MODE=per-tenant-uri
DB_URI_ENCRYPTION_KEY=aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789AbCd=
MONGO_URI=mongodb://localhost:27017/qabila
```

### Step 2: Generate Encryption Key (if using per-tenant-uri)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Step 3: Migrate Existing Tenants

```bash
cd apps/api
npx ts-node src/scripts/migrateTenantsToSeperateDb.ts
```

### Step 4: Restart API Server

```bash
npm run dev  # development
npm start    # production
```

### Step 5: Verify via Admin Dashboard

Visit Super Admin → DB Isolation Status to see all tenants' isolation modes.

## How It Works

### Data Flow When Creating New Tenant

```
Admin fills ImportTenant form
  ↓
Selects "Dedicated" mode + enters connection string
  ↓
Clicks "Test Connection"
  → Backend validates connectivity (MongoDB ping)
  → Returns ✓ or ✗ to frontend
  ↓
Admin confirms (or checks "Force-Create" + types "FORCE")
  ↓
Backend creates Tenant:
  1. Encrypts connection string with AES-256-GCM
  2. Stores encrypted URI (select: false)
  3. Sets dbStatus = 'ready'
  4. Logs to audit trail
  ↓
When querying tenant data:
  1. getTenantModels(tenantId) is called
  2. Tenant record is fetched
  3. Connection string is decrypted
  4. New mongoose.createConnection() to dedicated DB
  5. Models created against dedicated connection
  ↓
Tenant data is isolated from all other tenants
```

### Admin Monitoring

Super admins can:
1. **View all tenants** — See isolation mode, health status
2. **Test connections** — Click "فحص" (Check) to verify
3. **View audit log** — See all force-create events in Security page
4. **Filter by event** — "عرض أحداث Force-create فقط" checkbox

## Security Features

### 1. Encryption at Rest
- Connection strings encrypted with AES-256-GCM
- Keys rotated via environment variable
- Encrypted strings marked `select: false` (never returned in queries)

### 2. Audit Logging
- All force-create actions logged with user ID
- Accessible in Security page
- Can be filtered and exported

### 3. Rate Limiting
- Test-connection endpoint limited to 6 req/60s per IP
- Prevents connection-string brute-forcing
- (Note: Replace with Redis for production scale)

### 4. Connection Validation
- All connections tested before storing
- Health checks can be run on-demand
- Failed connections marked as 'failed' status

## Testing

### Test Connectivity Without Creating

```bash
curl -X POST http://localhost:3001/api/tenants/test-connection \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"uri": "mongodb://test-server:27017/test_db"}'
```

### Check All Tenants' Status

```bash
curl -X GET http://localhost:3001/api/tenants/status/db-isolation \
  -H "Authorization: Bearer <admin-token>"
```

### Verify Tenant Data Isolation

Connect to MongoDB and inspect databases:

```bash
# For multi-db-same-uri mode
use qabila_tenant_smith
db.persons.count()  # Should see Smith family only

use qabila_tenant_johnson
db.persons.count()  # Should see Johnson family only
```

## Files Changed / Added

### New Files:
- ✅ `apps/api/src/lib/crypto.ts` — AES encryption helpers
- ✅ `apps/api/src/scripts/migrateTenantsToSeperateDb.ts` — Migration tool
- ✅ `apps/web/src/pages/super-admin/DbIsolationStatus.tsx` — Status dashboard
- ✅ `docs/MULTI_TENANT_DB_SETUP.md` — Setup guide

### Modified Files:
- ✅ `apps/api/src/models/Tenant.ts` — Added DB isolation fields
- ✅ `apps/api/src/lib/tenantDb.ts` — Added multi-mode resolver
- ✅ `apps/api/src/routes/tenants.ts` — Added test-connection, status endpoints
- ✅ `apps/web/src/pages/super-admin/ImportTenant.tsx` — Added DB fields + UI
- ✅ `apps/web/src/pages/super-admin/Security.tsx` — Added force-create filter
- ✅ `apps/web/src/lib/api.ts` — Added API methods

## Production Checklist

- [ ] Generate strong `DB_URI_ENCRYPTION_KEY` (32 bytes)
- [ ] Set `TENANT_DB_MODE=multi-db-same-uri` or `per-tenant-uri`
- [ ] Run migration script for existing tenants
- [ ] Test connectivity to all tenant databases
- [ ] Verify audit logging is enabled
- [ ] Replace in-memory rate limiter with Redis (if scaling)
- [ ] Store encryption key in secret manager (AWS Secrets, Vault)
- [ ] Enable automated backups for all tenant databases
- [ ] Set up monitoring for `dbStatus` and `dbLastHealthAt`

## Next Steps (Recommended)

1. **Redis-backed Rate Limiting** — Replace in-memory limiter for distributed systems
2. **Secret Manager Integration** — Store encryption keys in AWS Secrets Manager / Vault
3. **Automated Health Checks** — Periodic connectivity verification
4. **Backup Automation** — Automated backups for all per-tenant databases
5. **Migration UI** — Frontend tool to migrate individual tenants

## Support & Troubleshooting

See [MULTI_TENANT_DB_SETUP.md](./MULTI_TENANT_DB_SETUP.md) for:
- Encryption key generation
- Migration troubleshooting
- Connection string validation
- Rollback procedures
