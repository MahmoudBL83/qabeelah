import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import dns from 'dns/promises';
import { Tenant } from '../models';
import Branch from '../models/Branch';
import { encryptString, decryptString } from '../lib/crypto';
import { getTenantModels } from '../lib/tenantDb';
import { recordSecurityEvent } from '../lib/security';
import { authenticate } from '../middleware/auth';
import { UserRole } from '../types/shared';
import { User } from '../models';

const router = Router();

type ImportedMember = {
  id?: string;
  firstName: string;
  lastName: string;
  birthYear?: number;
  deathYear?: number;
  isLiving?: boolean;
  parentId?: string;
  branchId?: string;
  bio?: string;
  imageSrc?: string;
};

const DEFAULT_BRANCH_NAME = 'الفرع الرئيسي';

const slugToTenantName = (slug: string) =>
  slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'عائلة جديدة';

const normalizeSlug = (value: string) => value.trim().toLowerCase();

const isValidSubdomain = (value: string) => /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(value);

const normalizeDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/g, '')
    .replace(/\.$/g, '');

const isValidCustomDomain = (value: string) =>
  /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(value) &&
  !value.includes('..') &&
  !value.endsWith('.qabila.com') &&
  value !== 'qabila.com';

const parseNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'نعم'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'لا'].includes(normalized)) return false;
  }
  return undefined;
};

const splitFullName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.includes(' ')) {
    return { firstName: trimmed, lastName: '' };
  }

  const lastSpace = trimmed.lastIndexOf(' ');
  return {
    firstName: trimmed.slice(0, lastSpace).trim(),
    lastName: trimmed.slice(lastSpace + 1).trim()
  };
};

const normalizeImportedMember = (member: Record<string, unknown>, familyName: string): ImportedMember | null => {
  const fullName = typeof member.fullName === 'string' ? member.fullName.trim() : '';
  const rawFirstName = typeof member.firstName === 'string' ? member.firstName.trim() : '';
  const rawLastName = typeof member.lastName === 'string' ? member.lastName.trim() : '';
  const nameParts = fullName ? splitFullName(fullName) : { firstName: rawFirstName, lastName: rawLastName };
  const firstName = nameParts.firstName || rawFirstName;
  const shouldDefaultFamily = Boolean(rawLastName) || fullName.includes(' ');
  const lastName = nameParts.lastName || rawLastName || (shouldDefaultFamily ? familyName : '');

  if (!firstName) return null;

  return {
    id: typeof member.id === 'string' ? member.id.trim() : undefined,
    firstName,
    lastName,
    birthYear: parseNumber(member.birthYear),
    deathYear: parseNumber(member.deathYear),
    isLiving: parseBoolean(member.isLiving),
    parentId: typeof member.parentId === 'string' ? member.parentId.trim() : undefined,
    branchId: typeof member.branchId === 'string' ? member.branchId.trim() : undefined,
    bio: typeof member.bio === 'string' ? member.bio.trim() : undefined,
    imageSrc: typeof member.imageSrc === 'string' ? member.imageSrc.trim() : undefined
  };
};

const buildImportedPeople = (
  tenantId: mongoose.Types.ObjectId,
  familyName: string,
  coverImage: string | undefined,
  members: ImportedMember[]
) => {
  const idMap = new Map<string, mongoose.Types.ObjectId>();
  const prepared = members.map((member, index) => {
    const personId = new mongoose.Types.ObjectId();
    const reference = member.id || `row-${index + 1}`;
    idMap.set(reference, personId);
    return { ...member, personId, reference };
  });

  return prepared.map((member, index) => {
    const parentId = member.parentId ? idMap.get(member.parentId) : undefined;
    return {
      _id: member.personId,
      tenantId,
      firstName: member.firstName,
      lastName: member.lastName || familyName,
      birthYear: member.birthYear,
      deathYear: member.deathYear,
      isLiving: typeof member.isLiving === 'boolean' ? member.isLiving : !member.deathYear,
      parentId,
      branchId: member.branchId,
      bio: member.bio,
      imageSrc: member.imageSrc || coverImage || undefined
    };
  });
};

const getDuplicateKeyDetails = (error: unknown) => {
  if (!error || typeof error !== 'object') return null;

  const candidate = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
    message?: string;
  };

  if (candidate.code !== 11000) return null;

  const field = candidate.keyPattern ? Object.keys(candidate.keyPattern)[0] : candidate.keyValue ? Object.keys(candidate.keyValue)[0] : undefined;
  const value = field && candidate.keyValue ? candidate.keyValue[field] : undefined;

  return {
    field,
    value
  };
};

const cleanupImportedTenant = async (tenantId: mongoose.Types.ObjectId | string) => {
  try {
    const { Person } = await getTenantModels(String(tenantId));
    await Person.deleteMany({ tenantId });
  } catch (cleanupError) {
    console.error('[import tenant] failed to clean up imported people', cleanupError);
  }

  try {
    await Tenant.deleteOne({ _id: tenantId });
  } catch (cleanupError) {
    console.error('[import tenant] failed to clean up tenant record', cleanupError);
  }
};

router.get('/', async (_req, res) => {
  try {
    const tenants = await Tenant.find().lean();
    const tenantsWithCounts = await Promise.all(
      tenants.map(async (tenant) => {
        const { Person } = await getTenantModels(String(tenant._id));
        const memberCount = await Person.countDocuments({ tenantId: tenant._id });
        return { ...tenant, memberCount };
      })
    );

    res.json(tenantsWithCounts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

router.get('/summary', async (_req, res) => {
  try {
    const tenantCount = await Tenant.countDocuments();
    const tenants = await Tenant.find().lean();
    const pendingCounts = await Promise.all(
      tenants.map(async (tenant) => {
        const { JoinRequest } = await getTenantModels(String(tenant._id));
        return JoinRequest.countDocuments({ status: 'pending', tenantId: tenant._id });
      })
    );
    const pendingJoinRequests = pendingCounts.reduce((sum, count) => sum + count, 0);

    res.json({ tenantCount, pendingJoinRequests });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.get('/resolve-current', async (_req, res) => {
  try {
    const resolvedTenantId = res.locals?.tenantId;
    const resolvedTenantSlug = res.locals?.tenantSlug;

    if (!resolvedTenantId && !resolvedTenantSlug) {
      return res.json({ tenant: null });
    }

    const tenant = resolvedTenantId
      ? await Tenant.findById(resolvedTenantId).lean()
      : await Tenant.findOne({ subdomain: resolvedTenantSlug }).lean();

    if (!tenant) {
      return res.json({ tenant: null });
    }

    return res.json({ tenant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to resolve tenant by host' });
  }
});

router.post('/import', authenticate, async (req, res) => {
  let createdTenantId: mongoose.Types.ObjectId | null = null;
  let isSuperAdmin = false;

  try {
    // @ts-ignore - set by auth middleware
    const user = req.user as { role: UserRole };
    isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const subdomain = typeof req.body?.subdomain === 'string' ? normalizeSlug(req.body.subdomain) : '';
    const customDomain = typeof req.body?.customDomain === 'string' && req.body.customDomain.trim()
      ? normalizeDomain(req.body.customDomain)
      : undefined;
    const coverImage = typeof req.body?.coverImage === 'string' && req.body.coverImage.trim()
      ? req.body.coverImage.trim()
      : undefined;
    const dbName = typeof req.body?.dbName === 'string' && req.body.dbName.trim()
      ? req.body.dbName.trim()
      : undefined;
    const rawDbConnectionUri = typeof req.body?.dbConnectionUri === 'string' && req.body.dbConnectionUri.trim()
      ? req.body.dbConnectionUri.trim()
      : undefined;
    const dbConnectionUri = rawDbConnectionUri ? encryptString(rawDbConnectionUri) : undefined;
    const dbIsolationMode = req.body?.dbIsolationMode === 'dedicated' ? 'dedicated' : 'shared';

    const rawMembers = Array.isArray(req.body?.members) ? (req.body.members as Record<string, unknown>[]) : [];
    const members = rawMembers
      .map((member) => normalizeImportedMember(member as Record<string, unknown>, name))
      .filter((member): member is ImportedMember => Boolean(member));

    if (!name || !subdomain) {
      return res.status(400).json({ error: 'Name and subdomain are required' });
    }

    if (!isValidSubdomain(subdomain)) {
      return res.status(400).json({ error: 'Tenant slug must be 3-50 lowercase letters, numbers, or hyphens' });
    }

    if (customDomain && !isValidCustomDomain(customDomain)) {
      return res.status(400).json({ error: 'Custom domain is invalid' });
    }

    if (dbIsolationMode === 'dedicated' && !rawDbConnectionUri) {
      return res.status(400).json({ error: 'dbConnectionUri is required when dbIsolationMode is dedicated' });
    }

    const existingQuery: Record<string, unknown>[] = [{ subdomain }];
    if (customDomain) {
      existingQuery.push({ customDomain });
    }

    const existingTenant = await Tenant.findOne({
      $or: existingQuery
    });
    if (existingTenant) {
      return res.status(409).json({
        error: existingTenant.subdomain === subdomain ? 'Tenant slug already exists' : 'Custom domain already exists'
      });
    }

    // If dedicated mode, verify the DB connection before creating tenant (unless forceCreate)
    const forceCreate = req.body?.forceCreate === true;
    if (dbIsolationMode === 'dedicated' && !forceCreate) {
      try {
        const testConn = mongoose.createConnection(rawDbConnectionUri as string, { serverSelectionTimeoutMS: 5000 });
        await new Promise<void>((resolve, reject) => {
          const onOpen = () => { cleanup(); resolve(); };
          const onError = (e: any) => { cleanup(); reject(e); };
          const onTimeout = () => { cleanup(); reject(new Error('Connection timed out')); };
          const cleanup = () => {
            testConn.off('open', onOpen as any);
            testConn.off('error', onError as any);
          };
          testConn.once('open', onOpen as any);
          testConn.once('error', onError as any);
          setTimeout(onTimeout, 5000);
        });
        // @ts-ignore
        await testConn.db.admin().ping();
        await testConn.close();
      } catch (err: any) {
        console.error('[import tenant] db connectivity test failed', err);
        return res.status(400).json({ error: `Failed to connect to provided DB: ${err?.message || String(err)}` });
      }
    }
    else if (dbIsolationMode === 'dedicated' && forceCreate) {
      // forceCreate requested: skip connectivity test (but still store encrypted URI)
      console.warn('[import tenant] forceCreate used, skipping DB connectivity test');
    }

    // AUTO-ASSIGN dbName if not provided (for automatic per-tenant isolation)
    const autoDbName = dbName || `qabila_tenant_${subdomain}`;

    const tenant = await Tenant.create({
      name,
      subdomain,
      customDomain,
      coverImage,
      isActive: true,
      dbName: autoDbName,
      dbConnectionUri,
      dbIsolationMode,
      dbStatus: dbIsolationMode === 'dedicated' ? 'ready' : 'pending'
    });
    createdTenantId = tenant._id;

    console.log(`[import] Created tenant "${name}" (${subdomain}) with DB: ${autoDbName}`);

    // Audit: record forceCreate usage
    try {
      const usedForce = req.body?.forceCreate === true;
      if (usedForce) {
        // @ts-ignore
        const userId = (req.user && (req.user as any).id) ? String((req.user as any).id) : 'system';
        void recordSecurityEvent(String(tenant._id), `Force create used on tenant import by user ${userId}`, { by: userId }, userId);
      }
    } catch (e) {
      console.error('Failed to record forceCreate audit', e);
    }

    const branchCache = new Map<string, string>();
    const resolveBranchIdForTenant = async (branchValue?: string | null) => {
      const normalized = (branchValue && branchValue.trim()) ? branchValue.trim() : DEFAULT_BRANCH_NAME;
      if (branchCache.has(normalized)) {
        return branchCache.get(normalized) as string;
      }

      if (mongoose.Types.ObjectId.isValid(normalized)) {
        const existing = await Branch.findOne({ _id: normalized, tenantId: tenant._id }).select('_id');
        if (existing) {
          const resolved = String(existing._id);
          branchCache.set(normalized, resolved);
          return resolved;
        }
      }

      let branch = await Branch.findOne({ tenantId: tenant._id, name: normalized }).select('_id');
      if (!branch) {
        branch = await Branch.create({ tenantId: tenant._id, name: normalized });
      }

      const resolved = String(branch._id);
      branchCache.set(normalized, resolved);
      return resolved;
    };

    const resolvedMembers = members.length > 0
      ? await Promise.all(
          members.map(async (member) => ({
            ...member,
            branchId: await resolveBranchIdForTenant(member.branchId)
          }))
        )
      : [];

    const { Person } = await getTenantModels(String(tenant._id));
    const importedPeople = resolvedMembers.length > 0
      ? buildImportedPeople(tenant._id, name, coverImage, resolvedMembers)
      : [];

    if (importedPeople.length > 0) {
      try {
        await Person.insertMany(importedPeople);
      } catch (insertError) {
        const duplicate = getDuplicateKeyDetails(insertError);
        await cleanupImportedTenant(tenant._id);

        if (duplicate) {
          return res.status(409).json({
            error: `Duplicate ${duplicate.field || 'record'} found while importing members`
          });
        }

        throw insertError;
      }
    }

    let adminAccount: { name: string; email: string; temporaryPassword: string } | null = null;
    const adminName = typeof req.body?.adminName === 'string' ? req.body.adminName.trim() : '';
    const adminEmail = typeof req.body?.adminEmail === 'string' ? req.body.adminEmail.trim().toLowerCase() : '';
    const adminPassword = typeof req.body?.adminPassword === 'string' ? req.body.adminPassword : '';

    if (!adminEmail) {
      return res.status(400).json({ error: 'Admin email is required' });
    }

    if (!adminPassword.trim()) {
      return res.status(400).json({ error: 'Admin password is required' });
    }

    const finalAdminName = adminName || `${name} Admin`;
    const finalAdminEmail = adminEmail;

    try {
      const existingUser = await User.findOne({ email: finalAdminEmail });
      if (existingUser) {
        await cleanupImportedTenant(tenant._id);
        return res.status(409).json({ error: 'Admin email already exists' });
      }

      const passwordHash = await bcrypt.hash(adminPassword, 10);
      try {
        await User.create({
          name: finalAdminName,
          email: finalAdminEmail,
          passwordHash,
          role: UserRole.QABILA_ADMIN,
          tenantId: tenant._id
        });
      } catch (createError) {
        const duplicate = getDuplicateKeyDetails(createError);
        await cleanupImportedTenant(tenant._id);

        if (duplicate?.field === 'email') {
          return res.status(409).json({ error: 'Admin email already exists' });
        }

        throw createError;
      }
      adminAccount = { name: finalAdminName, email: finalAdminEmail, temporaryPassword: adminPassword };
    } catch (err: any) {
      console.error('[import] Failed to create admin account:', err);
      throw err;
    }

    res.status(201).json({
      tenant,
      importedMembers: importedPeople.length,
      adminAccount
    });
  } catch (error) {
    if (createdTenantId) {
      await cleanupImportedTenant(createdTenantId);
    }

    const duplicate = getDuplicateKeyDetails(error);
    if (duplicate?.field === 'subdomain') {
      return res.status(409).json({ error: 'Tenant slug already exists' });
    }

    if (duplicate?.field === 'customDomain') {
      return res.status(409).json({ error: 'Custom domain already exists' });
    }

    if (duplicate?.field === 'email') {
      return res.status(409).json({ error: 'Admin email already exists' });
    }

    const details = error instanceof Error ? error.message : 'Unknown error';
    const payload: { error: string; details?: string } = { error: 'Failed to import tenant' };
    if (isSuperAdmin && details) {
      payload.details = details;
    }

    console.error(error);
    return res.status(500).json(payload);
  }
});

router.get('/availability/slug/:slug', authenticate, async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware
    const user = req.user as { role: UserRole };
    if (user?.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const slug = normalizeSlug(String(req.params.slug || ''));
    if (!slug) {
      return res.status(400).json({
        error: 'Tenant slug is required',
        available: false
      });
    }

    if (!isValidSubdomain(slug)) {
      return res.status(400).json({
        error: 'Tenant slug must be 3-50 lowercase letters, numbers, or hyphens',
        slug,
        available: false
      });
    }

    const existingTenant = await Tenant.exists({ subdomain: slug });
    return res.json({
      slug,
      available: !existingTenant
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to check tenant slug availability' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json(tenant);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

router.patch('/:id', authenticate, async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware
    const user = req.user as { role: UserRole; tenantId?: string };
    const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    const isTenantAdmin = user?.role === UserRole.QABILA_ADMIN && String(user?.tenantId) === String(req.params.id);

    if (!isSuperAdmin && !isTenantAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const currentTenant = await Tenant.findById(req.params.id).lean();
    if (!currentTenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const updates: Record<string, unknown> = {};
    if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body?.arabicName === 'string') {
      const normalized = req.body.arabicName.trim();
      updates.arabicName = normalized || undefined;
    }
    if (typeof req.body?.subdomain === 'string') {
      const normalized = normalizeSlug(req.body.subdomain);
      if (normalized !== currentTenant.subdomain) {
        return res.status(400).json({ error: 'Tenant slug is immutable after creation' });
      }
    }
    if (typeof req.body?.customDomain === 'string') {
      const normalized = normalizeDomain(req.body.customDomain);
      if (normalized && !isValidCustomDomain(normalized)) {
        return res.status(400).json({ error: 'Custom domain is invalid' });
      }
      if (normalized) {
        const existing = await Tenant.findOne({ _id: { $ne: req.params.id }, customDomain: normalized }).select('_id').lean();
        if (existing) {
          return res.status(409).json({ error: 'Custom domain already exists' });
        }
      }
      updates.customDomain = normalized || undefined;
      if (normalized !== (currentTenant.customDomain || '')) {
        updates.domainVerified = false;
        updates.domainVerificationToken = undefined;
      }
    }
    if (typeof req.body?.coverImage === 'string') {
      const normalized = req.body.coverImage.trim();
      updates.coverImage = normalized || undefined;
    }
    if (isSuperAdmin && typeof req.body?.dbName === 'string') {
      const normalized = req.body.dbName.trim();
      updates.dbName = normalized || undefined;
    }
    const forceCreatePatch = req.body?.forceCreate === true;
    if (isSuperAdmin && typeof req.body?.dbConnectionUri === 'string') {
      const normalized = req.body.dbConnectionUri.trim();
      // If changing/setting a dedicated connection URI, validate connectivity first unless forceCreatePatch
      if (normalized && !forceCreatePatch) {
        try {
          const testConn = mongoose.createConnection(normalized, { serverSelectionTimeoutMS: 5000 });
          await new Promise<void>((resolve, reject) => {
            const onOpen = () => { cleanup(); resolve(); };
            const onError = (e: any) => { cleanup(); reject(e); };
            const onTimeout = () => { cleanup(); reject(new Error('Connection timed out')); };
            const cleanup = () => {
              testConn.off('open', onOpen as any);
              testConn.off('error', onError as any);
            };
            testConn.once('open', onOpen as any);
            testConn.once('error', onError as any);
            setTimeout(onTimeout, 5000);
          });
          // @ts-ignore
          await testConn.db.admin().ping();
          await testConn.close();
        } catch (err: any) {
          console.error('[patch tenant] db connectivity test failed', err);
          return res.status(400).json({ error: `Failed to connect to provided DB: ${err?.message || String(err)}` });
        }
      } else if (normalized && forceCreatePatch) {
        console.warn('[patch tenant] forceCreate used, skipping DB connectivity test');
      }

      updates.dbConnectionUri = normalized ? encryptString(normalized) : undefined;
    }
    // If switching to dedicated without providing a new connection string, reject
    if (isSuperAdmin && req.body?.dbIsolationMode === 'dedicated' && !req.body?.dbConnectionUri) {
      const currentTenantWithConnection = await Tenant.findById(req.params.id).select('+dbConnectionUri').lean();
      if (!currentTenantWithConnection || !currentTenantWithConnection.dbConnectionUri) {
        return res.status(400).json({ error: 'Setting dbIsolationMode to dedicated requires providing dbConnectionUri' });
      }
    }
    if (isSuperAdmin && (req.body?.dbIsolationMode === 'shared' || req.body?.dbIsolationMode === 'dedicated')) {
      updates.dbIsolationMode = req.body.dbIsolationMode;
      updates.dbStatus = req.body.dbIsolationMode === 'dedicated' ? 'ready' : 'pending';
    }
    if (isSuperAdmin && typeof req.body?.isActive === 'boolean') {
      updates.isActive = req.body.isActive;
    }

    const updated = await Tenant.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).lean();
    if (!updated) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Audit: record forceCreate usage on patch
    try {
      if (forceCreatePatch) {
        // @ts-ignore
        const userId = (req.user && (req.user as any).id) ? String((req.user as any).id) : 'system';
        void recordSecurityEvent(String(updated._id), `Force create used on tenant update by user ${userId}`, { by: userId }, userId);
      }
    } catch (e) {
      console.error('Failed to record forceCreate audit (patch)', e);
    }

    res.json(updated);
  } catch (error) {
    const duplicate = getDuplicateKeyDetails(error);
    if (duplicate?.field === 'subdomain') {
      return res.status(409).json({ error: 'Tenant slug already exists' });
    }

    if (duplicate?.field === 'customDomain') {
      return res.status(409).json({ error: 'Custom domain already exists' });
    }

    console.error(error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware
    const user = req.user as { role: UserRole };
    if (user?.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await Tenant.findByIdAndDelete(req.params.id).lean();
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

// Start domain verification: generate token and save on tenant
router.post('/:id/domain/verify/start', authenticate, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user as { role: UserRole; tenantId?: string };
    const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    const isTenantAdmin = user?.role === UserRole.QABILA_ADMIN && String(user?.tenantId) === String(req.params.id);
    if (!isSuperAdmin && !isTenantAdmin) return res.status(403).json({ error: 'Access denied' });

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!tenant.customDomain) return res.status(400).json({ error: 'No custom domain set' });
    if (!isValidCustomDomain(tenant.customDomain)) return res.status(400).json({ error: 'Custom domain is invalid' });

    const duplicate = await Tenant.findOne({
      _id: { $ne: tenant._id },
      customDomain: tenant.customDomain
    }).select('_id').lean();
    if (duplicate) return res.status(409).json({ error: 'Custom domain already exists' });

    const token = crypto.randomBytes(16).toString('hex');
    tenant.domainVerificationToken = token;
    tenant.domainVerified = false;
    await tenant.save();

    return res.json({ token, instructions: {
      dns: `Add a TXT record for ${tenant.customDomain} with value: ${token}`,
      http: `Create a file at https://${tenant.customDomain}/.well-known/qabila-domain-verification.txt containing: ${token}`
    }});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start domain verification' });
  }
});

// Confirm domain verification (checks DNS TXT or HTTP file)
router.post('/:id/domain/verify/confirm', authenticate, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user as { role: UserRole; tenantId?: string };
    const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    const isTenantAdmin = user?.role === UserRole.QABILA_ADMIN && String(user?.tenantId) === String(req.params.id);
    if (!isSuperAdmin && !isTenantAdmin) return res.status(403).json({ error: 'Access denied' });

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!tenant.customDomain) return res.status(400).json({ error: 'No custom domain set' });
    if (!tenant.domainVerificationToken) return res.status(400).json({ error: 'No verification in progress' });

    const method = typeof req.body?.method === 'string' ? req.body.method : 'dns';
    const token = tenant.domainVerificationToken;

    let verified = false;
    if (method === 'dns') {
      try {
        const records = await dns.resolveTxt(tenant.customDomain as string);
        for (const r of records) {
          const flat = Array.isArray(r) ? r.join('') : String(r);
          if (flat.includes(token)) {
            verified = true;
            break;
          }
        }
      } catch (dnsErr) {
        // ignore DNS lookup errors
      }
    } else if (method === 'http') {
      try {
        // Node 18+ global fetch
        const resFetch = await fetch(`https://${tenant.customDomain}/.well-known/qabila-domain-verification.txt`, { method: 'GET', redirect: 'follow' });
        if (resFetch.ok) {
          const body = await resFetch.text();
          if (body.trim() === token) verified = true;
        }
      } catch (fetchErr) {
        // ignore fetch errors
      }
    }

    if (verified) {
      tenant.domainVerified = true;
      tenant.domainVerificationToken = undefined as any;
      await tenant.save();
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Verification failed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm domain verification' });
  }
});

// Simple in-memory rate limiter for test endpoint
const _rateLimit = new Map<string, { count: number; first: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 60s
const RATE_LIMIT_MAX = 6;

// Test a MongoDB connection string (SUPER_ADMIN only)
router.post('/test-connection', authenticate, async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware
    const user = req.user as { role: UserRole };
    if (user?.role !== UserRole.SUPER_ADMIN) return res.status(403).json({ error: 'Access denied' });

    const uri = typeof req.body?.uri === 'string' ? req.body.uri.trim() : '';
    if (!uri) return res.status(400).json({ error: 'Missing uri' });

    // basic rate limiting per IP
    try {
      const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      const now = Date.now();
      const entry = _rateLimit.get(String(ip)) || { count: 0, first: now };
      if (now - entry.first > RATE_LIMIT_WINDOW) {
        entry.count = 0;
        entry.first = now;
      }
      entry.count += 1;
      _rateLimit.set(String(ip), entry);
      if (entry.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests' });
      }
    } catch (err) {
      // ignore rate limiter errors
    }

    // Use a short-lived mongoose connection to validate connectivity
    const conn = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 });
    try {
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => { cleanup(); resolve(); };
        const onError = (e: any) => { cleanup(); reject(e); };
        const onTimeout = () => { cleanup(); reject(new Error('Connection timed out')); };
        const cleanup = () => {
          conn.off('open', onOpen as any);
          conn.off('error', onError as any);
        };
        conn.once('open', onOpen as any);
        conn.once('error', onError as any);
        setTimeout(onTimeout, 5000);
      });

      // run a lightweight ping
      try {
        // @ts-ignore
        await conn.db.admin().ping();
      } catch (pingErr) {
        // ignore ping errors and treat as connectivity failure
        throw pingErr;
      }

      await conn.close();
      return res.json({ ok: true });
    } catch (err: any) {
      try { await conn.close(); } catch {}
      console.error('[test-connection] error', err);
      return res.status(400).json({ ok: false, error: err?.message || String(err) });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

// Get DB isolation status for all tenants (SUPER_ADMIN only)
router.get('/status/db-isolation', authenticate, async (_req, res) => {
  try {
    // @ts-ignore - set by auth middleware
    const user = _req.user as { role: UserRole };
    if (user?.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenants = await Tenant.find().select('+dbConnectionUri').lean();
    const status = await Promise.all(
      tenants.map(async (tenant) => {
        const dbName = tenant.dbName || `qabila_tenant_${tenant.subdomain}`;
        return {
          tenantId: String(tenant._id),
          tenantName: tenant.name,
          subdomain: tenant.subdomain,
          dbName,
          dbIsolationMode: tenant.dbIsolationMode || 'shared',
          dbStatus: tenant.dbStatus || 'pending',
          dbMigratedAt: tenant.dbMigratedAt,
          dbLastHealthAt: tenant.dbLastHealthAt,
          hasConnectionUri: !!tenant.dbConnectionUri
        };
      })
    );

    res.json({ tenants: status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch DB isolation status' });
  }
});

// Update tenant DB status after verification (SUPER_ADMIN only)
router.post('/:id/db-status/update', authenticate, async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware
    const user = req.user as { role: UserRole };
    if (user?.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify the connection if in dedicated mode
    if (tenant.dbIsolationMode === 'dedicated' && tenant.dbConnectionUri) {
      try {
        const decrypted = decryptString(tenant.dbConnectionUri);
        const testConn = mongoose.createConnection(decrypted, { serverSelectionTimeoutMS: 5000 });
        await new Promise<void>((resolve, reject) => {
          const onOpen = () => { cleanup(); resolve(); };
          const onError = (e: any) => { cleanup(); reject(e); };
          const onTimeout = () => { cleanup(); reject(new Error('Timeout')); };
          const cleanup = () => {
            testConn.off('open', onOpen as any);
            testConn.off('error', onError as any);
          };
          testConn.once('open', onOpen as any);
          testConn.once('error', onError as any);
          setTimeout(onTimeout, 5000);
        });
        // @ts-ignore
        await testConn.db.admin().ping();
        await testConn.close();
        tenant.dbStatus = 'ready';
      } catch (err: any) {
        console.error('[db-status] connectivity check failed:', err);
        tenant.dbStatus = 'failed';
      }
    }

    tenant.dbLastHealthAt = new Date();
    await tenant.save();

    res.json({
      tenantId: String(tenant._id),
      dbStatus: tenant.dbStatus,
      dbLastHealthAt: tenant.dbLastHealthAt
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update DB status' });
  }
});

export default router;
