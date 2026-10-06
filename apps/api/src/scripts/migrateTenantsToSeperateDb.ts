/**
 * Migration script to move existing tenant data from shared DB to per-tenant dedicated DBs.
 * 
 * Usage:
 *   npx ts-node apps/api/src/scripts/migrateTenantsToSeperateDb.ts
 * 
 * Requirements:
 *   1. Set TENANT_DB_MODE=multi-db-same-uri (shared cluster, different db names)
 *   2. All tenants must have dbName and dbIsolationMode fields
 *   3. Connection to source MongoDB cluster
 *   4. Verify backups before running in production
 */

import mongoose from 'mongoose';
import Tenant from '../models/Tenant';
import { getPersonModel } from '../models/Person';
import { getEventModel } from '../models/Event';
import { getJoinRequestModel } from '../models/JoinRequest';
import { getLineageVerificationModel } from '../models/LineageVerification';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/qabila';
const BATCH_SIZE = 100;

interface MigrationResult {
  tenantId: string;
  tenantName: string;
  dbName: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  collectionStats: Record<string, { count: number; copied?: number; error?: string }>;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

const results: MigrationResult[] = [];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getSharedConnection = (dbName: string) => {
  const connection = mongoose.connection.useDb(dbName, { useCache: false });
  return connection;
};

const getDedicatedConnection = (baseUri: string, dbName: string) => {
  // Connect to the same MongoDB instance but use a different db name
  const connection = mongoose.createConnection(baseUri, { dbName });
  return connection;
};

const migrateCollectionData = async (
  sourceConn: mongoose.Connection,
  targetConn: mongoose.Connection,
  modelName: string,
  collectionName: string
) => {
  try {
    const sourceCollection = sourceConn.collection(collectionName);
    const targetCollection = targetConn.collection(collectionName);

    // Verify target is empty or warn
    const existingCount = await targetCollection.countDocuments();
    if (existingCount > 0) {
      console.warn(`  ⚠️  Target ${collectionName} already has ${existingCount} documents`);
    }

    // Count source documents
    const sourceCount = await sourceCollection.countDocuments();
    if (sourceCount === 0) {
      return { count: 0, copied: 0 };
    }

    console.log(`  Migrating ${collectionName}: ${sourceCount} documents...`);

    // Copy in batches
    let copied = 0;
    let skip = 0;
    while (skip < sourceCount) {
      const batch = await sourceCollection.find({}).skip(skip).limit(BATCH_SIZE).toArray();
      if (batch.length === 0) break;

      await targetCollection.insertMany(batch);
      copied += batch.length;
      skip += BATCH_SIZE;

      // Progress indicator
      process.stdout.write(`\r    Progress: ${copied}/${sourceCount}`);
    }
    console.log(''); // newline
    console.log(`  ✓ ${collectionName}: ${copied}/${sourceCount} copied`);

    return { count: sourceCount, copied };
  } catch (err: any) {
    console.error(`  ✗ Failed to migrate ${collectionName}:`, err.message);
    return { count: 0, copied: 0, error: err.message };
  }
};

const migrateTenant = async (tenant: any, baseUri: string) => {
  const tenantId = String(tenant._id);
  const tenantName = tenant.name;
  const dbName = tenant.dbName || `qabila_tenant_${tenant.subdomain}`;

  const result: MigrationResult = {
    tenantId,
    tenantName,
    dbName,
    status: 'pending',
    collectionStats: {}
  };
  results.push(result);

  try {
    // Skip if already marked as migrated
    if (tenant.dbMigratedAt) {
      console.log(`\n⊘ ${tenantName} (${tenantId}): Already migrated on ${tenant.dbMigratedAt}`);
      result.status = 'skipped';
      return;
    }

    // Skip if not in shared mode
    if (tenant.dbIsolationMode === 'dedicated') {
      console.log(`\n⊘ ${tenantName} (${tenantId}): Already using dedicated DB`);
      result.status = 'skipped';
      return;
    }

    console.log(`\n▶ ${tenantName} (${tenantId}) → DB: ${dbName}`);
    result.status = 'in-progress';
    result.startedAt = new Date();

    // Get shared connection (default main DB)
    const sourceConn = mongoose.connection;
    const targetConn = getDedicatedConnection(baseUri, dbName);

    // Wait for target connection to be ready
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve(); };
      const onError = (err: any) => { cleanup(); reject(err); };
      const onTimeout = () => { cleanup(); reject(new Error('Connection timeout')); };
      const cleanup = () => {
        targetConn.off('open', onOpen as any);
        targetConn.off('error', onError as any);
      };
      targetConn.once('open', onOpen as any);
      targetConn.once('error', onError as any);
      setTimeout(onTimeout, 10000);
    });

    // Migrate collections: Person, Event, JoinRequest, LineageVerification
    const collections = ['persons', 'events', 'joinrequests', 'lineageverifications'];
    for (const collName of collections) {
      const stats = await migrateCollectionData(sourceConn, targetConn, collName, collName);
      result.collectionStats[collName] = stats;
    }

    // Mark migration complete
    tenant.dbMigratedAt = new Date();
    tenant.dbStatus = 'ready';
    await Tenant.updateOne({ _id: tenant._id }, { dbMigratedAt: tenant.dbMigratedAt, dbStatus: 'ready' });

    result.status = 'completed';
    result.completedAt = new Date();
    console.log(`✓ ${tenantName}: Migration completed`);

    // Close target connection after a delay
    setTimeout(() => {
      targetConn.close().catch(err => console.error(`Failed to close connection for ${dbName}:`, err));
    }, 5000);

  } catch (err: any) {
    console.error(`✗ ${tenantName}: Migration failed:`, err.message);
    result.status = 'failed';
    result.error = err.message;
    result.completedAt = new Date();
  }
};

const main = async () => {
  try {
    console.log('🔄 Tenant Database Migration Script');
    console.log('====================================\n');

    // Connect to MongoDB
    console.log(`Connecting to ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected\n');

    // Fetch all tenants
    const tenants = await Tenant.find().select('+dbConnectionUri').lean();
    console.log(`Found ${tenants.length} tenant(s)\n`);

    if (tenants.length === 0) {
      console.log('No tenants to migrate. Exiting.');
      process.exit(0);
    }

    // Migrate each tenant
    for (const tenant of tenants) {
      await migrateTenant(tenant, MONGO_URI);
      await sleep(1000); // Rate limit connection creation
    }

    // Summary
    console.log('\n\n📊 Migration Summary');
    console.log('====================');
    const completed = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    console.log(`Completed: ${completed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${skipped}`);

    if (failed > 0) {
      console.log('\nFailed migrations:');
      results.filter(r => r.status === 'failed').forEach(r => {
        console.log(`  - ${r.tenantName} (${r.tenantId}): ${r.error}`);
      });
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
};

main();
