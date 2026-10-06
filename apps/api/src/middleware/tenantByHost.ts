import { Request, Response, NextFunction } from 'express';
import Tenant from '../models/Tenant';

export default async function tenantByHost(req: Request, res: Response, next: NextFunction) {
  try {
    const forwarded = req.headers['x-forwarded-host'] || req.headers['x-forwarded-server'];
    const hostHeader = (forwarded || req.headers.host || '').toString().split(':')[0].toLowerCase();
    if (!hostHeader) return next();

    // 1) exact customDomain match (only if domain is verified)
    const byCustom = await Tenant.findOne({ customDomain: hostHeader, domainVerified: true }).lean();
    if (byCustom) {
      res.locals.tenant = byCustom;
      res.locals.tenantId = String(byCustom._id);
      res.locals.tenantSlug = byCustom.subdomain;
      return next();
    }

    return next();
  } catch (err) {
    console.error('[tenantByHost] Error resolving tenant from host', err);
    return next();
  }
}
