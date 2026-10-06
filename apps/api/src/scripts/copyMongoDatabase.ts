import mongoose from 'mongoose';

type CopyOptions = {
  sourceUri: string;
  targetUri: string;
  dropTargetCollections: boolean;
};

const DEFAULT_BATCH_SIZE = 500;
const SYSTEM_COLLECTION_PREFIXES = ['system.'];

const parseDbName = (uri: string) => {
  try {
    const parsed = new URL(uri);
    const dbName = parsed.pathname.replace(/^\//, '').trim();
    return dbName || 'test';
  } catch {
    return 'test';
  }
};

const shouldSkipCollection = (name: string) => SYSTEM_COLLECTION_PREFIXES.some((prefix) => name.startsWith(prefix));

const copyCollectionIndexes = async (sourceCollection: any, targetCollection: any) => {
  const indexes = await sourceCollection.indexes();
  for (const index of indexes) {
    if (index.name === '_id_') continue;

    const { key, name, v, ns, ...options } = index as Record<string, unknown>;
    await targetCollection.createIndex(key as Record<string, 1 | -1 | 'text' | 'hashed'>, {
      ...options,
      name: typeof name === 'string' ? name : undefined,
    });
  }
};

const copyCollectionDocuments = async (sourceCollection: any, targetCollection: any) => {
  const cursor = sourceCollection.find({}).batchSize(DEFAULT_BATCH_SIZE);
  let buffer: Record<string, unknown>[] = [];
  let copied = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) continue;
    buffer.push(doc as Record<string, unknown>);

    if (buffer.length >= DEFAULT_BATCH_SIZE) {
      await targetCollection.insertMany(buffer, { ordered: false });
      copied += buffer.length;
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    await targetCollection.insertMany(buffer, { ordered: false });
    copied += buffer.length;
  }

  return copied;
};

const copyDatabase = async (sourceDb: any, targetDb: any, label: string, dropTargetCollections: boolean) => {
  const sourceCollections = await sourceDb.listCollections().toArray();
  console.log(`Copying ${label}: ${sourceCollections.length} collection(s)`);

  for (const collectionInfo of sourceCollections) {
    const collectionName = collectionInfo.name;
    if (shouldSkipCollection(collectionName)) continue;

    const sourceCollection = sourceDb.collection(collectionName);
    const targetCollection = targetDb.collection(collectionName);
    const sourceCount = await sourceCollection.countDocuments();

    if (dropTargetCollections) {
      const exists = await targetDb.listCollections({ name: collectionName }).hasNext();
      if (exists) {
        await targetCollection.drop().catch(() => undefined);
      }
    }

    if (sourceCount === 0) {
      console.log(`- ${label}.${collectionName}: empty`);
      continue;
    }

    const copied = await copyCollectionDocuments(sourceCollection, targetCollection);
    await copyCollectionIndexes(sourceCollection, targetCollection);
    console.log(`- ${label}.${collectionName}: copied ${copied}/${sourceCount}`);
  }
};

const collectTenantDbNames = async (sourceDb: any) => {
  try {
    const tenants = await sourceDb.collection('tenants').find({}).project({ dbName: 1, subdomain: 1 }).toArray();
    const names = new Set<string>();

    for (const tenant of tenants) {
      const dbName = typeof tenant.dbName === 'string' && tenant.dbName.trim()
        ? tenant.dbName.trim()
        : typeof tenant.subdomain === 'string' && tenant.subdomain.trim()
          ? `qabila_tenant_${tenant.subdomain.trim()}`
          : '';

      if (dbName) {
        names.add(dbName);
      }
    }

    return [...names];
  } catch {
    return [];
  }
};

const main = async () => {
  const sourceUri = process.env.SOURCE_MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URI;
  const targetUri = process.env.TARGET_MONGODB_URI || process.env.NEW_MONGODB_URI || process.env.MONGODB_URI;
  const dropTargetCollections = String(process.env.DROP_TARGET_COLLECTIONS || 'true').toLowerCase() !== 'false';

  if (!sourceUri) {
    throw new Error('Missing SOURCE_MONGODB_URI (or MONGO_URI/MONGODB_URI)');
  }

  if (!targetUri) {
    throw new Error('Missing TARGET_MONGODB_URI (or NEW_MONGODB_URI/MONGODB_URI)');
  }

  const sourceDbName = parseDbName(sourceUri);
  const targetDbName = parseDbName(targetUri);

  console.log('MongoDB copy starting');
  console.log(`Source db: ${sourceDbName}`);
  console.log(`Target db: ${targetDbName}`);

  const sourceConn = mongoose.createConnection(sourceUri, { dbName: sourceDbName });
  const targetConn = mongoose.createConnection(targetUri, { dbName: targetDbName });

  await Promise.all([
    sourceConn.asPromise(),
    targetConn.asPromise(),
  ]);

  try {
    const sourceDb = sourceConn.db;
    const targetDb = targetConn.db;

    if (!sourceDb || !targetDb) {
      throw new Error('Failed to open one of the MongoDB databases');
    }

    await copyDatabase(sourceDb, targetDb, sourceDbName, dropTargetCollections);

    const tenantDbNames = await collectTenantDbNames(sourceDb);
    for (const tenantDbName of tenantDbNames) {
      const tenantSourceConn = mongoose.createConnection(sourceUri, { dbName: tenantDbName });
      const tenantTargetConn = mongoose.createConnection(targetUri, { dbName: tenantDbName });
      await Promise.all([tenantSourceConn.asPromise(), tenantTargetConn.asPromise()]);

      const tenantSourceDb = tenantSourceConn.db;
      const tenantTargetDb = tenantTargetConn.db;
      if (!tenantSourceDb || !tenantTargetDb) {
        throw new Error(`Failed to open tenant db ${tenantDbName}`);
      }

      await copyDatabase(tenantSourceDb, tenantTargetDb, tenantDbName, dropTargetCollections);
      await Promise.all([tenantSourceConn.close(), tenantTargetConn.close()]);
    }

    console.log('MongoDB copy completed successfully');
  } finally {
    await Promise.allSettled([sourceConn.close(), targetConn.close()]);
  }
};

main().catch((error) => {
  console.error('MongoDB copy failed:', error);
  process.exit(1);
});