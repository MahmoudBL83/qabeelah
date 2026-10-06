import { Router } from 'express';
import { getTenantModels } from '../lib/tenantDb';
import { authenticate } from '../middleware/auth';
import { UserRole } from '../types/shared';
import { logActivity } from './activities';
import { ActivityType } from '../models/Activity';
import { validate, sanitize } from '../validation/middleware';
import {
  createPersonSchema,
  updatePersonSchema,
  searchPersonSchema,
} from '../validation/schemas';
import Branch from '../models/Branch';
import mongoose from 'mongoose';

// Helper to resolve string branch names into ObjectIds
const resolveBranchId = async (tenantId: string, branchValue?: string | null): Promise<string | undefined> => {
  if (!branchValue) return undefined;
  
  // If it's already a valid ObjectId, return it
  if (mongoose.Types.ObjectId.isValid(branchValue) && String(new mongoose.Types.ObjectId(branchValue)) === branchValue) {
    return branchValue;
  }
  
  // Try to find the branch by name
  let branch = await Branch.findOne({ tenantId, name: branchValue });
  if (!branch) {
    // Create it if it doesn't exist
    branch = new Branch({ tenantId, name: branchValue });
    await branch.save();
  }
  return String(branch._id);
};

const router = Router();

// Get all persons for a specific tenant
router.get('/', authenticate, async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware
    const user = req.user as { id: string; role: UserRole; tenantId?: string; branchId?: string };
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const { Person } = await getTenantModels(String(tenantId));
    let query: Record<string, any> = { tenantId };

    // Sub-admins can only see members from their own branch
    if (user?.role === UserRole.SUB_ADMIN) {
      query.branchId = user?.branchId || 'الفرع الرئيسي';
    }

    const persons = await Person.find(query).lean();
    res.json(persons);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching persons' });
  }
});

// Advanced search with filters
router.get('/search/:tenantId', authenticate, async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware
    const user = req.user as { id: string; role: UserRole; tenantId?: string; branchId?: string };
    const tenantId = String(req.params.tenantId);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const { query, branch, birthFrom, birthTo, livingOnly, hasBioOnly } = req.query;
    const { Person } = await getTenantModels(tenantId);

    const filters: Record<string, unknown> = { tenantId };

    // Sub-admins can only search within their own branch
    if (user?.role === UserRole.SUB_ADMIN) {
      filters.branchId = user?.branchId || 'الفرع الرئيسي';
    } else if (branch && typeof branch === 'string') {
      // Admins can search by branch if provided
      filters.branchId = branch;
    }

    // Full-text search on name
    if (query && typeof query === 'string' && query.trim()) {
      const q = query.trim().toLowerCase();
      filters.$or = [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } }
      ];
    }

    // Birth year range
    if (birthFrom) {
      const from = Number(birthFrom);
      if (!Number.isNaN(from)) {
        filters.birthYear = { ...filters.birthYear as any, $gte: from };
      }
    }
    if (birthTo) {
      const to = Number(birthTo);
      if (!Number.isNaN(to)) {
        filters.birthYear = { ...filters.birthYear as any, $lte: to };
      }
    }

    // Living status
    if (livingOnly === 'true') {
      filters.isLiving = true;
    }

    // Has bio filter
    if (hasBioOnly === 'true') {
      filters.bio = { $exists: true, $ne: null };
    }

    const persons = await Person.find(filters).lean();
    res.json(persons);
  } catch (error) {
    res.status(500).json({ error: 'Server error searching persons' });
  }
});

router.patch('/:id', authenticate, sanitize, validate(updatePersonSchema, 'body'), async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware
    const user = req.user as { id: string; role: UserRole; tenantId?: string; branchId?: string };
    const tenantId = String(user?.tenantId || req.body?.tenantId || req.query?.tenantId || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    const { Person } = await getTenantModels(tenantId);
    const person = await Person.findById(req.params.id);

    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    const tenantMatch = user?.tenantId && String(person.tenantId) === String(user.tenantId);
    const personBranch = person.branchId || 'الفرع الرئيسي';
    const canEdit =
      user?.role === UserRole.SUPER_ADMIN ||
      (user?.role === UserRole.QABILA_ADMIN && tenantMatch) ||
      (user?.role === UserRole.SUB_ADMIN && tenantMatch && user?.branchId && personBranch === user.branchId);

    if (!canEdit) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const canEditStructure = user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.QABILA_ADMIN;

    const {
      firstName,
      lastName,
      birthYear,
      deathYear,
      isLiving,
      bio,
      imageSrc,
      parentId,
      branchId,
      spouseIds,
      partnerships
    } = req.body;

    const updates: Record<string, unknown> = {};
    const parseNumber = (value: unknown) => {
      if (value === undefined) return undefined;
      if (value === null || value === '') return null;
      const parsed = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(parsed)) return 'invalid';
      return parsed;
    };

    if (typeof firstName === 'string') updates.firstName = firstName;
    if (typeof lastName === 'string') updates.lastName = lastName;
    if (typeof isLiving === 'boolean') updates.isLiving = isLiving;
    if (typeof bio === 'string') updates.bio = bio;
    if (typeof imageSrc === 'string') updates.imageSrc = imageSrc;

    const parsedBirth = parseNumber(birthYear);
    if (parsedBirth === 'invalid') {
      return res.status(400).json({ error: 'Invalid birthYear' });
    }
    if (parsedBirth !== undefined) updates.birthYear = parsedBirth;

    const parsedDeath = parseNumber(deathYear);
    if (parsedDeath === 'invalid') {
      return res.status(400).json({ error: 'Invalid deathYear' });
    }
    if (parsedDeath !== undefined) updates.deathYear = parsedDeath;

    if (canEditStructure && parentId !== undefined) {
      if (!parentId) {
        updates.parentId = null;
      } else if (String(parentId) === String(person._id)) {
        return res.status(400).json({ error: 'Person cannot be their own parent' });
      } else {
        const parent = await Person.findById(parentId);
        if (!parent) {
          return res.status(400).json({ error: 'Parent not found' });
        }
        if (String(parent.tenantId) !== String(person.tenantId)) {
          return res.status(400).json({ error: 'Parent must belong to the same tenant' });
        }
        updates.parentId = parent._id;
      }
    }

    if (canEditStructure && typeof branchId === 'string') {
      const resolvedBranch = await resolveBranchId(tenantId, branchId.trim() || 'الفرع الرئيسي');
      if (resolvedBranch) updates.branchId = resolvedBranch;
    }

    // Spouse / partnership updates
    if (Array.isArray(spouseIds)) {
      updates.spouseIds = spouseIds.map((s: any) => s ? String(s) : null).filter(Boolean);
    }
    if (Array.isArray(partnerships)) {
      updates.partnerships = partnerships.map((p: any) => ({ personId: p.personId ? String(p.personId) : null, type: p.type })).filter((x: any) => x.personId);
    }

    // Keep track of previous spouse links to update reciprocal relationships
    const previousSpouseIds: string[] = Array.isArray(person.spouseIds) ? person.spouseIds.map((s: any) => String(s)) : [];

    const updated = await Person.findByIdAndUpdate(req.params.id, updates, { new: true });

    // If spouseIds were updated, sync reciprocal links on the related Person documents
    try {
      if (Array.isArray(updates.spouseIds)) {
        const newSpouseIds = (updates.spouseIds as any[]).map((s) => String(s));
        const toAdd = newSpouseIds.filter((id) => !previousSpouseIds.includes(id));
        const toRemove = previousSpouseIds.filter((id) => !newSpouseIds.includes(id));

        // Add this person to newly linked spouses
        if (toAdd.length > 0) {
          await Person.updateMany(
            { _id: { $in: toAdd } },
            { $addToSet: { spouseIds: person._id } }
          );
        }

        // Remove this person from spouses that were unlinked
        if (toRemove.length > 0) {
          await Person.updateMany(
            { _id: { $in: toRemove } },
            { $pull: { spouseIds: person._id } }
          );
        }
      }
    } catch (e) {
      console.error('Failed to sync reciprocal spouse links', e);
    }

    // Log activity: Person updated
    try {
      const actorId = (user && user.id) || 'system';
      logActivity(String(tenantId), ActivityType.PROFILE_UPDATED, String(actorId), updated?._id?.toString(), 'Person', `Updated person: ${updated?.firstName || ''} ${updated?.lastName || ''}`);
    } catch (e) {
      console.error('Failed to log person update', e);
    }

    res.json(updated);
  } catch (error) {
    console.error('Failed to update person', error);
    const message = error && typeof (error as any).message === 'string' ? (error as any).message : 'Failed to update person';
    res.status(500).json({ error: message });
  }
});

const canManagePerson = (user: { role: UserRole; tenantId?: string; branchId?: string }, personTenantId: string, personBranchId?: string | null) => {
  const branchName = personBranchId || 'الفرع الرئيسي';
  if (user.role === UserRole.SUPER_ADMIN) return true;
  if (user.role === UserRole.QABILA_ADMIN) return !!user.tenantId && String(user.tenantId) === String(personTenantId);
  if (user.role === UserRole.SUB_ADMIN) {
    return !!user.tenantId && !!user.branchId && String(user.tenantId) === String(personTenantId) && String(user.branchId) === String(branchName);
  }
  return false;
};

// Create a new person
router.post('/', authenticate, sanitize, validate(createPersonSchema, 'body'), async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware
    const user = req.user as { id: string; role: UserRole; tenantId?: string; branchId?: string };
    const tenantId = String(user?.tenantId || req.body?.tenantId || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const { Person } = await getTenantModels(String(tenantId));

    const parentId = req.body?.parentId ? String(req.body.parentId) : undefined;
    const requestedBranchId = typeof req.body?.branchId === 'string' ? req.body.branchId.trim() || 'الفرع الرئيسي' : undefined;
    let effectiveBranchId = user.role === UserRole.SUB_ADMIN ? user.branchId || 'الفرع الرئيسي' : requestedBranchId || 'الفرع الرئيسي';

    if (parentId) {
      const parent = await Person.findById(parentId);
      if (!parent || String(parent.tenantId) !== String(tenantId)) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      effectiveBranchId = String(parent.branchId || 'الفرع الرئيسي');
      if (user.role === UserRole.SUB_ADMIN && String(parent.branchId || 'الفرع الرئيسي') !== String(effectiveBranchId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    if (!canManagePerson(user, tenantId, effectiveBranchId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const resolvedBranchId = await resolveBranchId(tenantId, effectiveBranchId);

    const newPerson = await Person.create({
      ...req.body,
      tenantId,
      branchId: resolvedBranchId
    });

    // Log activity: Member added to tree
    try {
      logActivity(tenantId, ActivityType.MEMBER_JOINED, String(user?.id || 'system'), newPerson._id?.toString(), 'Person', `Added person: ${newPerson.firstName || ''} ${newPerson.lastName || ''}`);
    } catch (e) {
      console.error('Failed to log person creation', e);
    }

    res.status(201).json(newPerson);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create person' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware
    const user = req.user as { id: string; role: UserRole; tenantId?: string; branchId?: string };
    const tenantId = String(user?.tenantId || req.query?.tenantId || '');
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const { Person } = await getTenantModels(tenantId);
    const person = await Person.findById(req.params.id);
    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    if (!canManagePerson(user, String(person.tenantId), person.branchId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const deleted = await Person.findByIdAndDelete(req.params.id);

    // Log activity: Person deleted
    try {
      const actor = (user && user.id) || 'system';
      logActivity(tenantId, ActivityType.PROFILE_UPDATED, String(actor), String(req.params.id), 'Person', `Deleted person: ${deleted?.firstName || ''} ${deleted?.lastName || ''}`);
    } catch (e) {
      console.error('Failed to log person deletion', e);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete person' });
  }
});

// Export persons as CSV
router.get('/export/csv', authenticate, async (req, res) => {
  try {
    // @ts-ignore - populated by auth middleware
    const user = req.user as { id: string; role: UserRole; tenantId?: string; branchId?: string };
    const tenantId = String(req.query.tenantId || '');
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
    const { Person } = await getTenantModels(tenantId);
    
    let query: Record<string, any> = { tenantId };
    // Sub-admins can only export members from their own branch
    if (user?.role === UserRole.SUB_ADMIN) {
      query.branchId = user?.branchId || 'الفرع الرئيسي';
    }
    
    const persons = await Person.find(query).lean();

    const headers = ['id', 'firstName', 'lastName', 'birthYear', 'deathYear', 'isLiving', 'branchId', 'spouseIds', 'createdAt', 'updatedAt', 'bio'];
    const escapeCsvCell = (value: unknown) => {
      if (value === undefined || value === null) return '';
      const normalized = Array.isArray(value)
        ? value.join('|')
        : value instanceof Date
          ? value.toISOString()
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);
      return /[",\n\r]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
    };

    const rows = persons.map((person) => headers.map((header) => escapeCsvCell((person as any)[header])).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="persons_${tenantId}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Failed to export persons CSV', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

export default router;
