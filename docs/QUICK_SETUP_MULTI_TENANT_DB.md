# Quick Setup: Per-Tenant Database Isolation

## 5-Minute Quick Start

### 1️⃣ Generate Encryption Key (if using dedicated mode)

```bash
# macOS/Linux
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# Node.js (any platform)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2️⃣ Set Environment Variables

Choose **ONE** of these:

#### Option A: Shared Cluster (Recommended for most users)
```bash
TENANT_DB_MODE=multi-db-same-uri
TENANT_DB_PREFIX=qabila_tenant_
MONGO_URI=mongodb://localhost:27017/qabila
```

#### Option B: Per-Tenant Servers (Maximum isolation)
```bash
TENANT_DB_MODE=per-tenant-uri
DB_URI_ENCRYPTION_KEY=<paste-from-step-1>
MONGO_URI=mongodb://localhost:27017/qabila
```

### 3️⃣ Restart API Server

```bash
npm run dev    # development
npm start      # production
```

### 4️⃣ Migrate Existing Tenants (if any)

```bash
cd apps/api
npx ts-node src/scripts/migrateTenantsToSeperateDb.ts
```

### 5️⃣ Verify Setup

Visit Super Admin → DB Isolation Status in your browser.

---

## Common Commands

### Test a Database Connection
```bash
curl -X POST http://localhost:3001/api/tenants/test-connection \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uri":"mongodb://your-db:27017/test"}'
```

### Check All Tenants' Isolation Status
```bash
curl -X GET http://localhost:3001/api/tenants/status/db-isolation \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create a Tenant with Dedicated Database
```bash
curl -X POST http://localhost:3001/api/tenants/import \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Smith Family",
    "subdomain": "smith",
    "dbIsolationMode": "dedicated",
    "dbConnectionUri": "mongodb://smith-db:27017/smith_family",
    "members": []
  }'
```

### Check Tenant Health
```bash
curl -X POST http://localhost:3001/api/tenants/{tenantId}/db-status/update \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Choosing a Mode

| Feature | Single (Legacy) | Multi-DB (Shared Cluster) | Per-Tenant (Dedicated) |
|---------|---|---|---|
| **Isolation** | ❌ None | ✅ Good | ✅✅ Excellent |
| **Setup Difficulty** | Easy | Easy | Medium |
| **Scalability** | Limited | Good | Excellent |
| **Cost** | Low | Low-Medium | Medium-High |
| **Use Case** | Dev/Test | Small-Medium | Enterprise |
| **Backup Complexity** | Simple | Medium | Complex |

**Recommendation:** Start with **Multi-DB (Shared Cluster)** unless you have strict security requirements.

---

## Environment Variables Explained

| Variable | Required? | Default | Example |
|----------|-----------|---------|---------|
| `TENANT_DB_MODE` | Yes | `single` | `multi-db-same-uri` |
| `TENANT_DB_PREFIX` | No | `qabila_tenant_` | `family_` |
| `DB_URI_ENCRYPTION_KEY` | If per-tenant-uri | — | Base64 string (32 bytes) |
| `MONGO_URI` | Yes | `mongodb://localhost:27017` | Your main DB |

---

## What Gets Isolated?

Each tenant's database contains:
- ✅ Person (family members)
- ✅ Event (family events)
- ✅ JoinRequest (membership requests)
- ✅ LineageVerification (genealogy verification)

Shared across all tenants (not isolated):
- ❌ Tenant (family metadata)
- ❌ User (login accounts)
- ❌ Activity (audit logs)

---

## Troubleshooting

### "TENANT_DB_MODE is not set"
→ Set in your `.env` or deployment config (defaults to 'single')

### "DB_URI_ENCRYPTION_KEY must be base64 of 32 bytes"
→ Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

### "Failed to connect to provided DB"
→ Test connection directly: `mongosh mongodb://your-uri`

### "Permission denied" errors
→ Verify MongoDB user has permissions on target database

### Tenants seeing each other's data
→ Verify `TENANT_DB_MODE` is NOT set to 'single' and restart server

---

## Production Checklist

- [ ] Environment variables are set
- [ ] Encryption key is strong (32 bytes)
- [ ] MongoDB user has appropriate permissions
- [ ] Backups are enabled for all databases
- [ ] Monitoring alerts are set up
- [ ] API server restarts cleanly
- [ ] Existing tenants have been migrated
- [ ] DB Isolation Status page shows all tenants as "ready"

---

## Need Help?

1. Check logs: `docker logs qabila-api` or `npm run dev`
2. Verify connectivity: `mongosh <your-connection-string>`
3. Run migration script: `npx ts-node src/scripts/migrateTenantsToSeperateDb.ts`
4. Check audit log: Super Admin → Security → Filter by "Force-create"

---

For detailed documentation, see **MULTI_TENANT_DB_SETUP.md**
