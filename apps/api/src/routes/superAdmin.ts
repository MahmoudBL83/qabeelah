import axios from 'axios';
import { Router } from 'express';
import { User, Tenant, PlatformSetting } from '../models';
import { UserRole } from '../types/shared';
import Activity from '../models/Activity';
import { getTenantModels } from '../lib/tenantDb';
import { authenticate } from '../middleware/auth';
import {
  getGlobalAnalytics,
  getModerationQueue,
  processModerationAction,
  getTenantDetailedStats,
  GlobalAnalytics,
  ModerationQueueItem,
} from '../services/analyticsService';
import { resolveBunnyConfig } from '../services/bunnyConfig';
import { requireApiKey } from '../lib/security';
const router = Router();

// Middleware: Super admin check (optional, relies on auth middleware upstream)
const verifySuperAdmin = async (req: any, res: any, next: any) => {
  try {
    const user = req.user; // Set by auth middleware
    if (!user || user.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ error: 'Forbidden: Super admin access required' });
    }
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authorization check failed' });
  }
};

const GEMINI_API_KEY_SETTING = 'gemini_api_key';
const GEMINI_MODEL_SETTING = 'gemini_model';
const TENANT_BASE_DOMAIN_SETTING = 'tenant_base_domain';
const TENANT_LOGIN_PATH_SETTING = 'tenant_login_path';
const BUNNY_API_KEY_SETTING = 'bunny_api_key';
const BUNNY_STORAGE_ZONE_SETTING = 'bunny_storage_zone';
const BUNNY_CDN_HOSTNAME_SETTING = 'bunny_cdn_hostname';
const BUNNY_CDN_TOKEN_KEY_SETTING = 'bunny_cdn_token_key';

const getDefaultTenantBaseDomain = () => {
  const configured = process.env.PUBLIC_TENANT_BASE_DOMAIN || process.env.TENANT_PUBLIC_BASE_DOMAIN || '';
  return configured.trim() || 'qabila.com';
};

const getDefaultTenantLoginPath = () => '/login';

const maskSecret = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, 2)}${'*'.repeat(Math.max(trimmed.length - 6, 4))}${trimmed.slice(-2)}`;
};

const normalizeCdnHostname = (value: string) => value.trim().replace(/\/+$/g, '');

const readPlatformSetting = async (key: string) => {
  const setting = await PlatformSetting.findOne({ key }).lean();
  return setting?.value?.trim() || '';
};

const upsertPlatformSetting = async (key: string, value: string, updatedBy?: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    await PlatformSetting.deleteOne({ key });
    return null;
  }

  return PlatformSetting.findOneAndUpdate(
    { key },
    { $set: { value: trimmed, updatedBy: updatedBy || undefined } },
    { upsert: true, new: true }
  );
};

router.get('/integrations/gemini', authenticate, verifySuperAdmin, async (_req, res) => {
  try {
    const apiKey = await readPlatformSetting(GEMINI_API_KEY_SETTING);
    const model = await readPlatformSetting(GEMINI_MODEL_SETTING);

    res.json({
      apiKeyConfigured: Boolean(apiKey),
      apiKeyLast4: apiKey ? apiKey.slice(-4) : '',
      model: model || 'gemini-2.0-flash',
      source: apiKey ? 'database' : 'environment',
    });
  } catch (error) {
    console.error('Failed to load Gemini settings:', error);
    res.status(500).json({ error: 'Failed to load Gemini settings' });
  }
});

router.put('/integrations/gemini', authenticate, verifySuperAdmin, async (req: any, res) => {
  try {
    const hasApiKey = Object.prototype.hasOwnProperty.call(req.body || {}, 'apiKey');
    const hasModel = Object.prototype.hasOwnProperty.call(req.body || {}, 'model');
    const clearApiKey = req.body?.clearApiKey === true;
    const apiKey = hasApiKey && typeof req.body?.apiKey === 'string' ? req.body.apiKey : undefined;
    const model = hasModel && typeof req.body?.model === 'string' ? req.body.model : undefined;
    const userId = String(req.user?.id || req.user?._id || '').trim() || undefined;

    const savedApiKey = clearApiKey
      ? await upsertPlatformSetting(GEMINI_API_KEY_SETTING, '', userId)
      : hasApiKey
        ? await upsertPlatformSetting(GEMINI_API_KEY_SETTING, apiKey || '', userId)
        : await PlatformSetting.findOne({ key: GEMINI_API_KEY_SETTING }).lean();

    const savedModel = hasModel
      ? await upsertPlatformSetting(GEMINI_MODEL_SETTING, model || '', userId)
      : await PlatformSetting.findOne({ key: GEMINI_MODEL_SETTING }).lean();

    res.json({
      success: true,
      apiKeyConfigured: Boolean(savedApiKey?.value?.trim()),
      apiKeyLast4: savedApiKey?.value ? savedApiKey.value.slice(-4) : '',
      model: savedModel?.value || 'gemini-2.0-flash',
      source: savedApiKey?.value?.trim() ? 'database' : 'environment',
    });
  } catch (error) {
    console.error('Failed to save Gemini settings:', error);
    res.status(500).json({ error: 'Failed to save Gemini settings' });
  }
});

router.get('/integrations/tenant-routing', authenticate, verifySuperAdmin, async (_req, res) => {
  try {
    const storedBaseDomain = await readPlatformSetting(TENANT_BASE_DOMAIN_SETTING);
    const storedLoginPath = await readPlatformSetting(TENANT_LOGIN_PATH_SETTING);

    res.json({
      baseDomain: storedBaseDomain || getDefaultTenantBaseDomain(),
      loginPath: storedLoginPath || getDefaultTenantLoginPath(),
      source: storedBaseDomain || storedLoginPath ? 'database' : 'environment',
    });
  } catch (error) {
    console.error('Failed to load tenant routing settings:', error);
    res.status(500).json({ error: 'Failed to load tenant routing settings' });
  }
});

router.put('/integrations/tenant-routing', authenticate, verifySuperAdmin, async (req: any, res) => {
  try {
    const hasBaseDomain = Object.prototype.hasOwnProperty.call(req.body || {}, 'baseDomain');
    const hasLoginPath = Object.prototype.hasOwnProperty.call(req.body || {}, 'loginPath');
    const userId = String(req.user?.id || req.user?._id || '').trim() || undefined;

    const sanitizeBaseDomain = (value: unknown) => {
      if (typeof value !== 'string') return '';
      return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/g, '');
    };

    const sanitizeLoginPath = (value: unknown) => {
      if (typeof value !== 'string') return '';
      const trimmed = value.trim();
      if (!trimmed) return '';
      return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    };

    const baseDomain = hasBaseDomain ? sanitizeBaseDomain(req.body?.baseDomain) : undefined;
    const loginPath = hasLoginPath ? sanitizeLoginPath(req.body?.loginPath) : undefined;

    if (hasBaseDomain && !baseDomain) {
      return res.status(400).json({ error: 'baseDomain is required when provided' });
    }

    if (hasLoginPath && !loginPath) {
      return res.status(400).json({ error: 'loginPath is required when provided' });
    }

    const savedBaseDomain = hasBaseDomain
      ? await upsertPlatformSetting(TENANT_BASE_DOMAIN_SETTING, baseDomain || '', userId)
      : await PlatformSetting.findOne({ key: TENANT_BASE_DOMAIN_SETTING }).lean();

    const savedLoginPath = hasLoginPath
      ? await upsertPlatformSetting(TENANT_LOGIN_PATH_SETTING, loginPath || '', userId)
      : await PlatformSetting.findOne({ key: TENANT_LOGIN_PATH_SETTING }).lean();

    res.json({
      success: true,
      baseDomain: savedBaseDomain?.value || getDefaultTenantBaseDomain(),
      loginPath: savedLoginPath?.value || getDefaultTenantLoginPath(),
      source: savedBaseDomain?.value || savedLoginPath?.value ? 'database' : 'environment',
    });
  } catch (error) {
    console.error('Failed to save tenant routing settings:', error);
    res.status(500).json({ error: 'Failed to save tenant routing settings' });
  }
});

router.get('/integrations/bunny', authenticate, verifySuperAdmin, async (_req, res) => {
  try {
    // For deployment security, return only hardcoded/env values (ignore database)
    const resolvedApiKey = process.env.BUNNY_API_KEY || '';
    const resolvedStorageZone = process.env.BUNNY_STORAGE_ZONE || '';
    const resolvedCdnHostname = process.env.BUNNY_CDN_HOSTNAME || '';
    const resolvedTokenKey = process.env.BUNNY_CDN_TOKEN_KEY || '';

    res.json({
      apiKey: resolvedApiKey,
      apiKeyConfigured: Boolean(resolvedApiKey),
      apiKeyLast4: resolvedApiKey.slice(-4),
      storageZone: resolvedStorageZone,
      cdnHostname: resolvedCdnHostname,
      tokenKey: resolvedTokenKey,
      tokenKeyConfigured: Boolean(resolvedTokenKey),
      tokenKeyLast4: resolvedTokenKey.slice(-4),
      source: 'hardcoded (deployment-secure)',
      readOnly: true,
    });
  } catch (error) {
    console.error('Failed to load Bunny settings:', error);
    res.status(500).json({ error: 'Failed to load Bunny settings' });
  }
});

router.put('/integrations/bunny', authenticate, verifySuperAdmin, async (_req, res) => {
  // Bunny settings are hardcoded for deployment security and cannot be edited via API
  res.status(403).json({
    error: 'Bunny settings are hardcoded for deployment security and cannot be edited via API.',
    readOnly: true,
    source: 'hardcoded (environment or code defaults)',
  });
});

  // Debug endpoint: return what the running server resolves as the Bunny config (masked)
  router.get('/integrations/bunny/resolve', authenticate, verifySuperAdmin, async (_req, res) => {
    try {
      const cfg = await resolveBunnyConfig();
      const maskedApiKey = cfg.apiKey ? `${cfg.apiKey.slice(0, 2)}***${cfg.apiKey.slice(-2)}` : '';
      const maskedToken = cfg.tokenKey ? `${cfg.tokenKey.slice(0, 2)}***${cfg.tokenKey.slice(-2)}` : '';

      res.json({
        apiKeyConfigured: Boolean(cfg.apiKey),
        apiKeyMasked: maskedApiKey,
        storageZone: cfg.storageZone,
        cdnHostname: cfg.cdnHostname,
        tokenKeyConfigured: Boolean(cfg.tokenKey),
        tokenKeyMasked: maskedToken,
        source: cfg.apiKey || cfg.storageZone || cfg.cdnHostname || cfg.tokenKey ? 'resolved' : 'environment',
      });
    } catch (error) {
      console.error('Failed to resolve Bunny config for debug:', error);
      res.status(500).json({ error: 'Failed to resolve Bunny config' });
    }
  });

router.get('/integrations/bunny/test', authenticate, verifySuperAdmin, async (_req, res) => {
  try {
    const cfg = await resolveBunnyConfig();
    const storageHost = `https://${cfg.storageZone}.storage.bunnycdn.com`;

    if (!cfg.apiKey) {
      return res.status(400).json({
        ok: false,
        error: 'Bunny API key is not configured',
        resolved: {
          storageZone: cfg.storageZone,
          cdnHostname: cfg.cdnHostname,
        },
      });
    }

    const response = await axios.head(storageHost, {
      headers: { AccessKey: cfg.apiKey },
      timeout: 15000,
      validateStatus: () => true,
    });

    res.json({
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      statusText: response.statusText,
      storageHost,
      resolved: {
        storageZone: cfg.storageZone,
        cdnHostname: cfg.cdnHostname,
        apiKeyConfigured: Boolean(cfg.apiKey),
        tokenKeyConfigured: Boolean(cfg.tokenKey),
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      res.status(500).json({
        ok: false,
        error: error.message,
        code: error.code || '',
        status: error.response?.status || null,
        statusText: error.response?.statusText || '',
        storageHost: `https://${(await resolveBunnyConfig()).storageZone}.storage.bunnycdn.com`,
      });
      return;
    }

    console.error('Failed to test Bunny settings:', error);
    res.status(500).json({ ok: false, error: 'Failed to test Bunny settings' });
  }
});

// Test upload probe: try to upload a small test file to Bunny
router.post('/integrations/bunny/test-upload', authenticate, verifySuperAdmin, async (_req, res) => {
  try {
    const cfg = await resolveBunnyConfig();

    if (!cfg.apiKey) {
      return res.status(400).json({
        ok: false,
        error: 'Bunny API key is not configured',
        resolved: {
          storageZone: cfg.storageZone,
          cdnHostname: cfg.cdnHostname,
        },
      });
    }

    // Create a small test file (1KB text)
    const testContent = Buffer.from('Test file from Qabila admin probe: ' + new Date().toISOString());
    const testFileName = `test-${Date.now()}.txt`;
    const uploadPath = `/${cfg.storageZone}/${testFileName}`;
    const bunnyStorageApi = 'https://storage.bunnycdn.com';

    const response = await axios.put(
      `${bunnyStorageApi}${uploadPath}`,
      testContent,
      {
        headers: {
          'AccessKey': cfg.apiKey,
          'Content-Type': 'text/plain',
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    const success = response.status >= 200 && response.status < 300;
    const result: any = {
      ok: success,
      status: response.status,
      statusText: response.statusText,
      uploadPath,
      fileName: testFileName,
      resolved: {
        storageZone: cfg.storageZone,
        cdnHostname: cfg.cdnHostname,
        apiKeyConfigured: Boolean(cfg.apiKey),
      },
    };

    if (!success) {
      result.error = response.statusText || 'Upload failed';
      result.responseData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } else {
      result.cdnUrl = `${cfg.cdnHostname}${uploadPath}`;
      result.message = 'Test upload successful!';
    }

    res.json(result);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      res.status(500).json({
        ok: false,
        error: error.message,
        code: error.code || '',
        status: error.response?.status || null,
        statusText: error.response?.statusText || '',
        responseData: typeof error.response?.data === 'string' ? error.response.data : JSON.stringify(error.response?.data),
      });
      return;
    }

    console.error('Failed to test upload to Bunny:', error);
    res.status(500).json({ ok: false, error: 'Failed to test upload to Bunny' });
  }
});

/**
 * GET /api/super-admin/moderation/queue
 * Get all pending moderation items across platform
 * Query params: type=lineage_verification|join_request, priority=high|medium|low
 */
router.get('/moderation/queue', async (req, res) => {
  try {
    let queue = await getModerationQueue();

    // Filter by type if specified
    if (req.query.type) {
      queue = queue.filter((item: ModerationQueueItem) => item.type === req.query.type);
    }

    // Filter by priority if specified
    if (req.query.priority) {
      queue = queue.filter((item: ModerationQueueItem) => item.priority === req.query.priority);
    }

    // Filter by tenant if specified
    if (req.query.tenantId) {
      queue = queue.filter((item: ModerationQueueItem) => item.tenantId === req.query.tenantId);
    }

    // Pagination
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const skip = (page - 1) * limit;

    const paginatedQueue = queue.slice(skip, skip + limit);

    res.json({
      data: paginatedQueue,
      pagination: {
        total: queue.length,
        page,
        limit,
        pages: Math.ceil(queue.length / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching moderation queue:', error);
    res.status(500).json({ error: 'Failed to fetch moderation queue' });
  }
});

/**
 * GET /api/super-admin/moderation/queue/:id
 * Get details of a specific moderation queue item
 */
router.get('/moderation/queue/:id', async (req, res) => {
  try {
    const queue = await getModerationQueue();
    const item = queue.find((q: ModerationQueueItem) => q.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Moderation item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching moderation item:', error);
    res.status(500).json({ error: 'Failed to fetch moderation item' });
  }
});

/**
 * POST /api/super-admin/moderation/queue/:id/action
 * Process a moderation action (approve/reject/hold)
 * Body: { itemType, action: 'approve'|'reject'|'hold', notes?, tenantId }
 */
router.post('/moderation/queue/:id/action', async (req, res) => {
  try {
    const { itemType, action, notes, tenantId } = req.body;

    if (!itemType || !action || !tenantId) {
      return res.status(400).json({ error: 'itemType, action, and tenantId are required' });
    }

    if (!['approve', 'reject', 'hold'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action: must be approve, reject, or hold' });
    }

    await processModerationAction(req.params.id, itemType, action, notes || '', tenantId);

    res.json({ success: true, message: `Moderation action '${action}' processed` });
  } catch (error) {
    console.error('Error processing moderation action:', error);
    res.status(500).json({ error: 'Failed to process moderation action' });
  }
});

/**
 * POST /api/super-admin/moderation/bulk-action
 * Process bulk moderation actions
 * Body: { itemIds[], action, notes?, tenantId }
 */
router.post('/moderation/bulk-action', requireApiKey(), async (req, res) => {
  try {
    const { itemIds, itemType, action, notes, tenantId } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds array is required and must not be empty' });
    }

    if (!itemType || !action || !tenantId) {
      return res.status(400).json({ error: 'itemType, action, and tenantId are required' });
    }

    const results = await Promise.allSettled(
      itemIds.map((id: string) => processModerationAction(id, itemType, action, notes || '', tenantId))
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    res.json({
      success: true,
      processed: successful,
      failed,
      message: `Bulk action completed: ${successful} successful, ${failed} failed`,
    });
  } catch (error) {
    console.error('Error processing bulk moderation action:', error);
    res.status(500).json({ error: 'Failed to process bulk moderation action' });
  }
});

/**
 * GET /api/super-admin/stats/summary
 * Quick summary of platform stats
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const analytics = await getGlobalAnalytics(30);

    res.json({
      tenantCount: analytics.overview.totalTenants,
      activeTenantCount: analytics.overview.activeTenants,
      userCount: analytics.overview.totalPlatformUsers,
      memberCount: analytics.overview.totalMembers,
      lineageVerified: analytics.overview.lineageVerificationStats.verified,
      lineagePending: analytics.overview.lineageVerificationStats.pending,
      verificationRate: analytics.platformHealth.verificationRate,
      avgMembersPerTenant: analytics.platformHealth.avgMembersPerTenant,
      lastUpdated: analytics.platformHealth.lastUpdated,
    });
  } catch (error) {
    console.error('Error fetching summary stats:', error);
    res.status(500).json({ error: 'Failed to fetch summary stats' });
  }
});

/**
 * GET /api/super-admin/analytics/global
 * Return the full GlobalAnalytics payload for the super-admin dashboard
 */
router.get('/analytics/global', authenticate, verifySuperAdmin, async (req, res) => {
  try {
    const lastDays = Math.min(Number(req.query.lastDays || 30), 365);
    const analytics = await getGlobalAnalytics(lastDays);
    return res.json(analytics);
  } catch (error) {
    console.error('Error fetching global analytics:', error);
    return res.status(500).json({ error: 'Failed to fetch global analytics' });
  }
});

/**
 * GET /api/super-admin/stats/tenant/:tenantId
 * Get detailed stats for a specific tenant
 */
router.get('/stats/tenant/:tenantId', async (req, res) => {
  try {
    const stats = await getTenantDetailedStats(req.params.tenantId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching tenant stats:', error);
    res.status(500).json({ error: 'Failed to fetch tenant stats' });
  }
});

/**
 * GET /api/super-admin/activity/audit-log
 * Get audit log of moderation actions
 * Query params: limit=50, page=1, tenantId?, type?
 */
router.get('/activity/audit-log', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 100);
    const page = Math.max(Number(req.query.page || 1), 1);
    const type = String(req.query.type || 'MODERATION_ACTION');

    const query: any = { type };

    if (req.query.tenantId) {
      query.tenantId = req.query.tenantId;
    }

    const total = await Activity.countDocuments(query);
    const logs = await Activity.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

/**
 * GET /api/super-admin/analytics/export
 * Export analytics as CSV
 * Query params: format=csv, lastDays=30
 */
router.get('/analytics/export', async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    if (format !== 'csv') {
      return res.status(400).json({ error: 'Only csv format is currently supported' });
    }

    const lastDays = Math.min(Number(req.query.lastDays || 30), 365);
    const analytics = await getGlobalAnalytics(lastDays);

    const rows: string[] = [];
    rows.push('Analytics Export - ' + new Date().toISOString());
    rows.push('');

    // Overview section
    rows.push('PLATFORM OVERVIEW');
    rows.push('Metric,Value');
    for (const [key, value] of Object.entries(analytics.overview)) {
      if (typeof value === 'object') {
        for (const [subKey, subValue] of Object.entries(value)) {
          rows.push(`${key}_${subKey},${subValue}`);
        }
      } else {
        rows.push(`${key},${value}`);
      }
    }
    rows.push('');

    // Platform health
    rows.push('PLATFORM HEALTH');
    rows.push('Metric,Value');
    for (const [key, value] of Object.entries(analytics.platformHealth)) {
      if (key !== 'lastUpdated') {
        rows.push(`${key},${value}`);
      }
    }
    rows.push('');

    // Recent activity
    rows.push('RECENT ACTIVITY (LAST ' + lastDays + ' DAYS)');
    rows.push('Date,Events,User Joins,Verifications');
    for (const activity of analytics.recentActivity) {
      rows.push(`${activity.date},${activity.eventCount},${activity.userJoinCount},${activity.verificationCount}`);
    }
    rows.push('');

    // Top tenants
    rows.push('TOP TENANTS BY MEMBER COUNT');
    rows.push('Tenant Name,Members,Admins,Pending Requests,Events');
    for (const tenant of analytics.topTenants) {
      rows.push(
        `"${tenant.name}",${tenant.memberCount},${tenant.adminCount},${tenant.joinRequestsPending},${tenant.eventCount}`
      );
    }
    rows.push('');

    // Activity distribution
    rows.push('ACTIVITY TYPE DISTRIBUTION');
    rows.push('Type,Count,Percentage');
    for (const activity of analytics.activityTypeDistribution) {
      rows.push(`${activity.type},${activity.count},${activity.percentage}%`);
    }

    const csv = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=platform-analytics-${new Date().toISOString().split('T')[0]}.csv`);
    return res.send(csv);
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
});

// Protect analytics export with API key to allow internal exports without user session
router.get('/analytics/export', requireApiKey(), async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    if (format !== 'csv') {
      return res.status(400).json({ error: 'Only csv format is currently supported' });
    }

    const lastDays = Math.min(Number(req.query.lastDays || 30), 365);
    const analytics = await getGlobalAnalytics(lastDays);

    const rows: string[] = [];
    rows.push('Analytics Export - ' + new Date().toISOString());
    rows.push('');

    // Overview section
    rows.push('PLATFORM OVERVIEW');
    rows.push('Metric,Value');
    for (const [key, value] of Object.entries(analytics.overview)) {
      if (typeof value === 'object') {
        for (const [subKey, subValue] of Object.entries(value)) {
          rows.push(`${key}_${subKey},${subValue}`);
        }
      } else {
        rows.push(`${key},${value}`);
      }
    }
    rows.push('');

    // Platform health
    rows.push('PLATFORM HEALTH');
    rows.push('Metric,Value');
    for (const [key, value] of Object.entries(analytics.platformHealth)) {
      if (key !== 'lastUpdated') {
        rows.push(`${key},${value}`);
      }
    }
    rows.push('');

    // Recent activity
    rows.push('RECENT ACTIVITY (LAST ' + lastDays + ' DAYS)');
    rows.push('Date,Events,User Joins,Verifications');
    for (const activity of analytics.recentActivity) {
      rows.push(`${activity.date},${activity.eventCount},${activity.userJoinCount},${activity.verificationCount}`);
    }
    rows.push('');

    // Top tenants
    rows.push('TOP TENANTS BY MEMBER COUNT');
    rows.push('Tenant Name,Members,Admins,Pending Requests,Events');
    for (const tenant of analytics.topTenants) {
      rows.push(
        `"${tenant.name}",${tenant.memberCount},${tenant.adminCount},${tenant.joinRequestsPending},${tenant.eventCount}`
      );
    }
    rows.push('');

    // Activity distribution
    rows.push('ACTIVITY TYPE DISTRIBUTION');
    rows.push('Type,Count,Percentage');
    for (const activity of analytics.activityTypeDistribution) {
      rows.push(`${activity.type},${activity.count},${activity.percentage}%`);
    }

    const csv = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=platform-analytics-${new Date().toISOString().split('T')[0]}.csv`);
    return res.send(csv);
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
});

export default router;
