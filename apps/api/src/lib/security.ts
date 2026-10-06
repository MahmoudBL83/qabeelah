import mongoose from 'mongoose';
import { NextFunction, Request, Response } from 'express';
import Tenant from '../models/Tenant';
import { ActivityType } from '../models/Activity';
import { logActivity } from '../routes/activities';

type RateLimitState = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
};

type TenantRequestLike = Request & {
  user?: { id?: string; tenantId?: string };
};

const rateLimitStore = new Map<string, RateLimitState>();

const normalizeIp = (value: string) =>
  value
    .trim()
    .replace(/^::ffff:/, '')
    .replace(/^\[(.*)\]$/, '$1')
    .toLowerCase();

export const getClientIp = (req: Pick<Request, 'headers' | 'ip'>) => {
  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : '';

  const ip = firstForwarded || req.ip || '';
  return normalizeIp(String(ip || 'unknown'));
};

const getRequestFingerprint = (req: Pick<Request, 'headers' | 'ip'>, keyPrefix: string) =>
  `${keyPrefix}:${getClientIp(req)}`;

const findTenantRecord = async (tenantKey: string) => {
  const normalized = String(tenantKey || '').trim();
  if (!normalized) return null;

  if (mongoose.isValidObjectId(normalized)) {
    const tenantById = await Tenant.findById(normalized).lean<{ allowedIps?: string[] }>();
    if (tenantById) return tenantById;
  }

  return Tenant.findOne({ subdomain: normalized.toLowerCase() }).lean<{ allowedIps?: string[] }>();
};

export const createRateLimiter = ({ windowMs, max, keyPrefix }: RateLimitOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = getRequestFingerprint(req, keyPrefix);
    const now = Date.now();
    const current = rateLimitStore.get(key);

    if (!current || current.resetAt <= now) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;
    rateLimitStore.set(key, current);

    if (current.count > max) {
      const retryAfter = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter,
      });
    }

    next();
  };
};

export const extractTenantIdFromRequest = (req: Request) => {
  const bodyTenantId = String((req.body as any)?.tenantId || '').trim();
  if (bodyTenantId) return bodyTenantId;

  const paramTenantId = String((req.params as any)?.tenantId || '').trim();
  if (paramTenantId) return paramTenantId;

  const queryTenantId = String((req.query as any)?.tenantId || '').trim();
  if (queryTenantId) return queryTenantId;

  const userTenantId = String((req as TenantRequestLike).user?.tenantId || '').trim();
  return userTenantId;
};

export const recordSecurityEvent = async (
  tenantId: string,
  description: string,
  metadata: Record<string, unknown> = {},
  userId = 'system'
) => {
  if (!tenantId) return;

  await logActivity(
    tenantId,
    ActivityType.SECURITY_EVENT,
    userId,
    undefined,
    'Security',
    description,
    metadata
  );
};

export const tenantIpWhitelist = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = extractTenantIdFromRequest(req);
    if (!tenantId) return next();

    try {
      const tenant = await findTenantRecord(tenantId);
      const allowedIps = (tenant?.allowedIps || []).map(normalizeIp).filter(Boolean);

      if (allowedIps.length === 0) {
        return next();
      }

      const clientIp = getClientIp(req);
      if (allowedIps.includes(clientIp)) {
        return next();
      }

      void recordSecurityEvent(tenantId, 'Blocked request from non-whitelisted IP', {
        ip: clientIp,
        path: req.path,
        method: req.method,
      });

      return res.status(403).json({ error: 'Access denied from this IP address' });
    } catch (error) {
      console.error('Tenant IP whitelist check failed:', error);
      return next();
    }
  };
};

export const requireApiKey = () => {
  const configuredKeys = new Set(
    String(process.env.SERVICE_API_KEYS || process.env.SERVICE_API_KEY || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

  return (req: Request, res: Response, next: NextFunction) => {
    if (configuredKeys.size === 0) return next();

    const apiKey = String(req.headers['x-api-key'] || '').trim();
    if (apiKey && configuredKeys.has(apiKey)) {
      return next();
    }

    return res.status(401).json({ error: 'Invalid or missing API key' });
  };
};

export const resetRateLimitStateForTests = () => {
  rateLimitStore.clear();
};