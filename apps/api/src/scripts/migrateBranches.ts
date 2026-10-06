import mongoose from 'mongoose';
import Branch from '../models/Branch';

/**
 * Migrates legacy string-based branchIds to new ObjectId-based Branch documents.
 */
export async function migrateLegacyBranches() {
  console.log('[Migration] Starting legacy branches migration...');
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const personsCollection = db.collection('persons');
    const usersCollection = db.collection('users');

    // 1. Find all distinct string branchIds across all tenants
    // Since we need tenant context, we'll aggregate over persons
    const legacyBranches = await personsCollection.aggregate([
      { 
        $match: { 
          branchId: { $type: 'string' } 
        } 
      },
      { 
        $group: { 
          _id: { tenantId: '$tenantId', branchName: '$branchId' } 
        } 
      }
    ]).toArray();

    const userLegacyBranches = await usersCollection.aggregate([
      { 
        $match: { 
          branchId: { $type: 'string' },
          tenantId: { $exists: true, $ne: null }
        } 
      },
      { 
        $group: { 
          _id: { tenantId: '$tenantId', branchName: '$branchId' } 
        } 
      }
    ]).toArray();

    // Merge unique tenantId + branchName combinations
    const allLegacy = new Map<string, { tenantId: mongoose.Types.ObjectId, branchName: string }>();
    
    [...legacyBranches, ...userLegacyBranches].forEach((doc) => {
      const { tenantId, branchName } = doc._id;
      if (!tenantId || !branchName) return;
      // Skip if it's already a valid ObjectId (somehow)
      if (mongoose.Types.ObjectId.isValid(branchName) && String(new mongoose.Types.ObjectId(branchName)) === branchName) {
        return;
      }
      const key = `${tenantId.toString()}_${branchName}`;
      if (!allLegacy.has(key)) {
        allLegacy.set(key, { tenantId, branchName });
      }
    });

    if (allLegacy.size === 0) {
      console.log('[Migration] No legacy string branches found. Migration skipped.');
      return;
    }

    console.log(`[Migration] Found ${allLegacy.size} unique legacy branches to migrate.`);

    // 2. Create Branch documents for each unique legacy branch
    for (const [, { tenantId, branchName }] of allLegacy) {
      // Check if branch already exists
      let branch = await Branch.findOne({ tenantId, name: branchName });
      if (!branch) {
        branch = new Branch({ tenantId, name: branchName });
        await branch.save();
        console.log(`[Migration] Created branch '${branchName}' for tenant ${tenantId}`);
      }

      // 3. Update all Persons and Users that have this string branchId
      const personUpdateResult = await personsCollection.updateMany(
        { tenantId, branchId: branchName },
        { $set: { branchId: branch._id } }
      );
      
      const userUpdateResult = await usersCollection.updateMany(
        { tenantId, branchId: branchName },
        { $set: { branchId: branch._id } }
      );

      console.log(`[Migration] Updated ${personUpdateResult.modifiedCount} persons and ${userUpdateResult.modifiedCount} users for branch '${branchName}'`);
    }

    console.log('[Migration] Legacy branches migration completed successfully.');
  } catch (error) {
    console.error('[Migration] Failed to migrate legacy branches:', error);
  }
}
