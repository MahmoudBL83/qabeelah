# Per-Tenant Database Isolation Setup Guide

This guide explains how to set up and enable per-tenant database isolation for Qabelah.

## Overview

The system supports three database modes:

1. **`single`** (default) — All tenants share one MongoDB database
2. **`multi-db-same-uri`** — All tenants use the same MongoDB cluster but different database names (recommended for shared clusters)
3. **`per-tenant-uri`** — Each tenant has its own dedicated MongoDB connection URI and database

## Quick Start

### 1. Set Environment Variables

For **multi-db-same-uri** (shared cluster, different DB names):

```bash
TENANT_DB_MODE=multi-db-same-uri
TENANT_DB_PREFIX=qabila_tenant_
MONGO_URI=mongodb://localhost:27017/qabila
```

For **per-tenant-uri** (dedicated connections per tenant):

```bash
TENANT_DB_MODE=per-tenant-uri
DB_URI_ENCRYPTION_KEY=<base64-encoded-32-bytes>
MONGO_URI=mongodb://localhost:27017/qabila
```

### 2. Generate Encryption Key (for dedicated mode)

If using `per-tenant-uri`, you need a 32-byte encryption key for connection strings:

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Python
python3 -c "import base64, secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

Example output:
```
aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789AbCd=
```

Set this as `DB_URI_ENCRYPTION_KEY` in your environment.

### 3. Migrate Existing Tenants

If you have existing tenants in a shared database, migrate them to isolated databases:

```bash
# Run the migration script
npx ts-node apps/api/src/scripts/migrateTenantsToSeperateDb.ts
```

This script will:
- Copy all tenant collections to their own databases
- Update `dbMigratedAt` timestamp
- Skip already-migrated tenants
- Report migration status

## Environment Variables Reference

| Variable | Default | Mode | Description |
|----------|---------|------|-------------|
| `TENANT_DB_MODE` | `single` | All | `single`, `multi-db-same-uri`, or `per-tenant-uri` |
| `TENANT_DB_PREFIX` | `qabila_tenant_` | `multi-db-same-uri` | Prefix for auto-generated DB names |
| `DB_URI_ENCRYPTION_KEY` | ❌ Required | `per-tenant-uri` | Base64-encoded 32-byte key for encrypting connection strings |
| `MONGO_URI` | `mongodb://localhost:27017` | All | Main MongoDB connection URI |

## Enabling Multi-DB Mode

### Step 1: Choose Mode

- **`multi-db-same-uri`** — Best for:
  - Single MongoDB cluster
  - Shared hosting
  - Simpler operational overhead
  - All tenants on same server

- **`per-tenant-uri`** — Best for:
  - Each tenant on separate MongoDB instance
  - Strict data isolation
  - High security requirements
  - Different MongoDB versions per tenant

### Step 2: Set TENANT_DB_MODE

In your `.env` (development) or deployment config (production):

```
TENANT_DB_MODE=multi-db-same-uri
```

### Step 3: Migrate Existing Data

Run the migration script:

```bash
cd apps/api
npx ts-node src/scripts/migrateTenantsToSeperateDb.ts
```

Monitor output for completion status.

### Step 4: Verify Setup

Check DB isolation status via admin API:

```bash
curl -X GET http://localhost:3001/api/tenants/status/db-isolation \
  -H "Authorization: Bearer <admin-token>"
```

Response shows each tenant's DB mode and status:

```json
{
  "tenants": [
    {
      "tenantId": "...",
      "tenantName": "Smith Family",
      "customDomain": "smith-family.com",
      "dbName": "qabila_tenant_smith",
      "dbIsolationMode": "shared",
      "dbStatus": "ready",
      "dbMigratedAt": "2026-05-17T10:00:00Z",
      "hasConnectionUri": false
    }
  ]
}
```

### Step 5: Create New Tenants with Isolation

Use the import endpoint with DB isolation:

```bash
POST /api/tenants/import
{
  "name": "Johnson Family",
  "customDomain": "johnson-family.com",
  "dbIsolationMode": "dedicated",
  "dbConnectionUri": "mongodb://dedicated-cluster:27017/johnson_db",
  "members": [...]
}
```

### Step 6: Connect a Family Domain

If the family wants to open the platform on its own domain instead of a platform label, set `customDomain` and then configure DNS at the domain provider:

```text
CNAME  www.johnson-family.com  ->  your-platform-host.com
A/ALIAS  johnson-family.com    ->  platform IP or provider target
TXT    johnson-family.com      ->  verification token shown in the family domain screen
```

After the DNS record is saved, use the family admin dashboard to start domain verification, then confirm it once the token resolves.

The system will:
- Test the connection (unless `forceCreate` is set)
- Encrypt and store the connection URI
- Mark tenant as ready
- Log all operations to audit log

## Verifying DB Isolation

### Check Tenant Status

```bash
curl -X GET http://localhost:3001/api/tenants/status/db-isolation \
  -H "Authorization: Bearer <token>"
```

### Manual Health Check

```bash
curl -X POST http://localhost:3001/api/tenants/:tenantId/db-status/update \
  -H "Authorization: Bearer <token>"
```

Updates `dbLastHealthAt` and verifies connection.

### Database Inspection

Connect to MongoDB and verify data separation:

```bash
# For multi-db-same-uri mode
use qabila_tenant_smith
db.persons.count()

use qabila_tenant_johnson
db.persons.count()
```

## Production Considerations

### 1. Encryption Key Management

**Development:**
- Store `DB_URI_ENCRYPTION_KEY` in `.env`

**Production:**
- Use AWS Secrets Manager, HashiCorp Vault, or similar
- Rotate keys periodically
- Never commit to version control

### 2. Rate Limiting

The test-connection endpoint has in-memory rate limiting (6 requests per 60s per IP).

**For production**, replace with Redis-based limiter:
- Set `REDIS_URL` environment variable
- Implement distributed rate limiter in middleware
- See `apps/api/src/lib/security.ts` for example

### 3. Backup Strategy

When using multiple databases:

```bash
# Backup all tenant databases
for db in qabila_tenant_*; do
  mongodump --db $db --out backups/$db
done

# Backup main database
mongodump --db qabila --out backups/main
```

### 4. Monitoring

Track:
- `dbStatus` changes
- `dbLastHealthAt` staleness
- Connection timeouts/failures
- Migration progress

## Troubleshooting

### Issue: Migration fails for a tenant

**Solution:**
- Check source database connectivity
- Verify target database is writable
- Run manually with debug logging:
  ```bash
  DEBUG=* npx ts-node src/scripts/migrateTenantsToSeperateDb.ts
  ```

### Issue: Connection string encryption fails

**Solution:**
- Verify `DB_URI_ENCRYPTION_KEY` is set and valid
- Ensure key is base64-encoded 32 bytes (44 characters)
- Generate new key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

### Issue: Test connection succeeds but queries fail

**Solution:**
- Verify database name in connection string
- Check if specified database exists on target server
- Verify user has appropriate permissions on target database

### Issue: Tenants seeing each other's data

**Symptoms:**
- `TENANT_DB_MODE=single` still active
- Tenant queries return data from multiple tenants

**Solution:**
1. Verify `TENANT_DB_MODE` is set correctly
2. Restart API server
3. Check logs for mode confirmation at startup
4. Run migration to set `dbMigratedAt` timestamps

## Rollback

To revert to single-database mode:

```bash
# Set back to single mode
TENANT_DB_MODE=single

# Verify in logs
# API logs should show: "TENANT_DB_MODE=single; using shared database"

# Optional: Copy all data back to main database
# (See migration script for reverse logic)
```

## Support

For issues or questions:
1. Check deployment logs: `docker logs qabila-api`
2. Verify environment variables: `env | grep TENANT_DB`
3. Test connectivity: `curl /api/tenants/test-connection`
4. Review audit log: `GET /api/admin/audit?type=SECURITY_EVENT`
