import { Request, Response, NextFunction } from 'express';
import Tenant from '../models/Tenant';

const APP_BASE_DOMAIN = (process.env.APP_BASE_DOMAIN || '').toLowerCase();

export default async function redirectToCustomDomain(req: Request, res: Response, next: NextFunction) {
  try {
    const forwarded = req.headers['x-forwarded-host'] || req.headers['x-forwarded-server'];
    const hostHeader = (forwarded || req.headers.host || '').toString().split(':')[0].toLowerCase();
    if (!hostHeader) return next();

    // Only attempt redirect from the configured base domain
    if (!APP_BASE_DOMAIN) return next();
    if (hostHeader !== APP_BASE_DOMAIN) return next();

    // Ignore API and asset routes
    const p = req.path || '';
    if (p.startsWith('/api') || p.startsWith('/_next') || p.startsWith('/static') || p.startsWith('/favicon')) return next();

    const segments = p.split('/').filter(Boolean); // ['aljazi','tree']
    if (segments.length === 0) return next();

    const slug = segments[0];

    const tenant = await Tenant.findOne({ subdomain: slug, domainVerified: true }).lean();
    if (!tenant || !tenant.customDomain) return next();

    // preserve remainder of path and querystring
    const remainder = req.url.replace(new RegExp(`^/${slug}`), '') || '/';
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || (process.env.NODE_ENV === 'production' ? 'https' : 'http')) as string;
    const target = `${proto}://${tenant.customDomain}${remainder}`;

    // Temporary redirect (302) so browsers follow during testing; can be 301 in production
    return res.redirect(302, target);
  } catch (err) {
    console.error('[redirectToCustomDomain] error', err);
    return next();
  }
}
