import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { getJwtSecret } from '../lib/jwtSecret';

const AUTH_COOKIE_NAME = 'qabila_session';

const parseCookieHeader = (cookieHeader: string | undefined) => {
  if (!cookieHeader) return {} as Record<string, string>;
  return cookieHeader.split(';').reduce((acc, part) => {
    const [rawName, ...rawValue] = part.split('=');
    const name = rawName.trim();
    if (!name) return acc;
    acc[name] = decodeURIComponent(rawValue.join('=').trim());
    return acc;
  }, {} as Record<string, string>);
};

const getAuthTokenFromRequest = (req: Request) => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if ((req as any).cookies && (req as any).cookies.qabila_session) {
    token = (req as any).cookies.qabila_session;
  }
  if (token) return token;

  const cookies = parseCookieHeader(req.headers.cookie as string | undefined);
  return cookies[AUTH_COOKIE_NAME] || '';
};

export const isSessionCurrent = (tokenSessionVersion: unknown, currentSessionVersion: unknown) => {
  const tokenVersion = typeof tokenSessionVersion === 'number' ? tokenSessionVersion : 0;
  const currentVersion = typeof currentSessionVersion === 'number' ? currentSessionVersion : 0;
  return tokenVersion === currentVersion;
};

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = getAuthTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: 'No token provided, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const userId = String((decoded as { id?: string }).id || '');

    if (!userId) {
      return res.status(401).json({ error: 'Token is not valid' });
    }

    const user = await User.findById(userId).select('sessionVersion');
    if (!user) {
      return res.status(401).json({ error: 'Token is not valid' });
    }

    if (!isSessionCurrent((decoded as { sessionVersion?: number }).sessionVersion, user.sessionVersion)) {
      return res.status(401).json({ error: 'Session has been revoked' });
    }

    // @ts-ignore
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};
