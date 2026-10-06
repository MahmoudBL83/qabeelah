import mongoose from 'mongoose';
import Tenant from '../models/Tenant';
import { getPersonModel } from '../models/Person';
import { getEventModel } from '../models/Event';
import { getJoinRequestModel } from '../models/JoinRequest';
import { getLineageVerificationModel } from '../models/LineageVerification';

type TenantDbMode = 'single' | 'multi-db-same-uri' | 'per-tenant-uri';

// Default to multi-db-same-uri for automatic per-tenant isolation
// Only use 'single' if TENANT_DB_MODE is explicitly set to 'single'
const TENANT_DB_MODE = (process.env.TENANT_DB_MODE || 'multi-db-same-uri') as TenantDbMode;
const TENANT_DB_PREFIX = process.env.TENANT_DB_PREFIX || 'qabila_tenant_';

console.log(`[tenantDb] MODE: ${TENANT_DB_MODE}, PREFIX: ${TENANT_DB_PREFIX}`);

const connectionCache = new Map<string, mongoose.Connection>();

type TenantRecord = {
  _id: mongoose.Types.ObjectId;
  subdomain?: string;
  dbName?: string;
  dbConnectionUri?: string;
  dbIsolationMode?: 'shared' | 'dedicated';
};

const findTenantRecord = async (tenantKey: string) => {
  const normalized = String(tenantKey || '').trim();
  if (!normalized) return null;

  if (mongoose.isValidObjectId(normalized)) {
    const tenantById = await Tenant.findById(normalized).select('+dbConnectionUri').lean<TenantRecord>();
    if (tenantById) return tenantById;
  }

  return Tenant.findOne({ subdomain: normalized.toLowerCase() }).select('+dbConnectionUri').lean<TenantRecord>();
};

const resolveTenantDbName = (tenant: TenantRecord) => {
  if (tenant.dbName) return tenant.dbName;
  const slug = tenant.subdomain || String(tenant._id);
  return `${TENANT_DB_PREFIX}${slug}`;
};

const getSharedTenantConnection = (dbName: string) => {
  if (connectionCache.has(dbName)) {
    return connectionCache.get(dbName) as mongoose.Connection;
  }

  const connection = mongoose.connection.useDb(dbName, { useCache: true });
  connectionCache.set(dbName, connection);
  return connection;
};

const getDedicatedTenantConnection = (connectionUri: string, dbName?: string) => {
  const cacheKey = `${connectionUri}::${dbName || ''}`;
  const cached = connectionCache.get(cacheKey);
  if (cached && (cached.readyState === 1 || cached.readyState === 2)) {
    return cached;
  }

  if (cached) {
    connectionCache.delete(cacheKey);
  }

  const options = dbName ? { dbName } : undefined;
  const connection = mongoose.createConnection(connectionUri, options);
  connectionCache.set(cacheKey, connection);
  return connection;
};

export const getTenantModels = async (tenantId: string) => {
  if (TENANT_DB_MODE === 'single') {
    return {
      Person: getPersonModel(mongoose.connection),
      Event: getEventModel(mongoose.connection),
      JoinRequest: getJoinRequestModel(mongoose.connection),
      LineageVerification: getLineageVerificationModel(mongoose.connection),
    };
  }

  const tenant = await findTenantRecord(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const dbName = resolveTenantDbName(tenant);
  const shouldUseDedicatedConnection =
    TENANT_DB_MODE === 'per-tenant-uri' || tenant.dbIsolationMode === 'dedicated';

  let connection: mongoose.Connection;
  if (shouldUseDedicatedConnection) {
    if (!tenant.dbConnectionUri) {
      throw new Error('Tenant has no dedicated db connection URI configured');
    }
    let decryptedUri = tenant.dbConnectionUri as string;
    try {
      decryptedUri = decryptString(decryptedUri);
    } catch (err) {
      // If decryption fails, log and throw
      console.error('[tenantDb] failed to decrypt tenant dbConnectionUri', err);
      throw new Error('Failed to read tenant DB connection string');
    }
    connection = getDedicatedTenantConnection(decryptedUri, dbName);
  } else {
    connection = getSharedTenantConnection(dbName);
  }

  return {
    Person: getPersonModel(connection),
    Event: getEventModel(connection),
    JoinRequest: getJoinRequestModel(connection),
    LineageVerification: getLineageVerificationModel(connection),
  };
};

export const getTenantDbName = async (tenantId: string) => {
  const tenant = await findTenantRecord(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  return resolveTenantDbName(tenant);
};
import { decryptString } from './crypto';
