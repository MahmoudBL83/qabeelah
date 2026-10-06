import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Tenant from '../models/Tenant';
import { getTenantModels } from '../lib/tenantDb';
import { UserRole } from '../types/shared';
import { authenticate } from '../middleware/auth';
import { validate, sanitize } from '../validation/middleware';
import {
  loginSchema,
  signupSchema,
  changePasswordSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  emailPreferencesSchema,
} from '../validation/schemas';
import {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  generateEmailVerificationToken,
  generatePasswordResetToken,
} from '../lib/mailer';
import { hashToken } from '../lib/tokenUtils';
import { createRateLimiter } from '../lib/security';
import { getJwtSecret } from '../lib/jwtSecret';

const router = Router();
const JWT_SECRET = getJwtSecret();
const AUTH_COOKIE_NAME = 'qabila_session';

const authCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const setAuthCookie = (res: Response, token: string) => {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
};

const clearAuthCookie = (res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  });
};

const REQUIRE_TENANT_LOGIN = process.env.REQUIRE_TENANT_LOGIN === 'true';
const loginRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8, keyPrefix: 'auth-login' });
const registerRateLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5, keyPrefix: 'auth-register' });

const toSafeUser = (user: any, tenantSlug?: string) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  sessionVersion: user.sessionVersion,
  tenantId: user.tenantId,
  tenantSlug,
  branchId: user.branchId,
  phone: user.phone,
  avatarUrl: user.avatarUrl,
  bio: user.bio,
  location: user.location,
  emailPreferences: user.emailPreferences,
});

const normalizeTenantSlug = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : '';

const tenantSlugFromRequest = (req: Request) => {
  const bodySlug = normalizeTenantSlug(req.body?.tenantSlug);
  if (bodySlug) return bodySlug;

  const localSlug = normalizeTenantSlug((resolvableLocals(req) as any)?.tenantSlug);
  return localSlug;
};

const resolvableLocals = (req: Request) => (req as unknown as { res?: Response }).res?.locals || {};

const getSessionVersion = (user: { sessionVersion?: number }) => user.sessionVersion || 0;

const buildSessionPayload = (user: { _id: unknown; role: UserRole; tenantId?: unknown; branchId?: unknown; sessionVersion?: number }) => ({
  id: user._id,
  role: user.role,
  tenantId: user.tenantId,
  branchId: user.branchId ? String(user.branchId) : undefined,
  sessionVersion: getSessionVersion(user),
});

const invalidateSessions = async (userId: string) => {
  await User.updateOne({ _id: userId }, { $inc: { sessionVersion: 1 } });
};

const loginWithScope = async (req: Request, res: Response, scope: 'tenant' | 'platform' | 'any') => {
  const { email, password } = req.body;
  const normalizedTenantSlug = tenantSlugFromRequest(req);
  let tenantId: string | undefined;

  if (normalizedTenantSlug) {
    const tenant = await Tenant.findOne({ subdomain: normalizedTenantSlug });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    tenantId = String(tenant._id);
  }

  if (scope === 'tenant' && !tenantId) {
    return res.status(400).json({ error: 'Tenant code is required' });
  }

  if (scope === 'any' && REQUIRE_TENANT_LOGIN && !tenantId) {
    return res.status(400).json({ error: 'Tenant code is required' });
  }

  let user = scope === 'platform'
    ? await User.findOne({ email, role: UserRole.SUPER_ADMIN })
    : tenantId
      ? await User.findOne({ email, tenantId })
      : await User.findOne({ email });

  if (!user && scope === 'any' && tenantId) {
    user = await User.findOne({ email, role: UserRole.SUPER_ADMIN });
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (scope === 'platform' && user.role !== UserRole.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Platform admin login only' });
  }

  if (scope === 'tenant' && user.role === UserRole.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Use platform admin login' });
  }

  if (scope !== 'platform' && user.role !== UserRole.SUPER_ADMIN && !tenantId) {
    return res.status(400).json({ error: 'Tenant code is required' });
  }

  if (tenantId && user.tenantId && String(user.tenantId) !== String(tenantId)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Members created through join requests must wait for admin approval.
  if (scope !== 'platform' && user.role === UserRole.MEMBER && tenantId) {
    try {
      const { JoinRequest } = await getTenantModels(String(tenantId));
      const joinRequest = await JoinRequest.findOne({
        tenantId: String(tenantId),
        email: String(user.email).toLowerCase(),
      })
        .sort({ createdAt: -1 })
        .lean<{ status?: string }>();

      if (joinRequest?.status === 'pending') {
        return res.status(403).json({
          error: 'Join request is pending approval',
          code: 'JOIN_REQUEST_PENDING',
        });
      }

      if (joinRequest?.status === 'rejected') {
        return res.status(403).json({
          error: 'Join request has been rejected',
          code: 'JOIN_REQUEST_REJECTED',
        });
      }
    } catch (joinRequestError) {
      console.error('Failed to check join request status during login', joinRequestError);
      return res.status(500).json({ error: 'Server error during tenant login' });
    }
  }

  const tenant = user.tenantId ? await Tenant.findById(user.tenantId).lean() : null;

  const token = jwt.sign(buildSessionPayload(user), JWT_SECRET, { expiresIn: '7d' });
  setAuthCookie(res, token);

  return res.json({ token, user: toSafeUser(user, tenant?.subdomain) });
};

// Register
router.post('/register', registerRateLimiter, sanitize, validate(signupSchema, 'body'), async (req: Request, res: Response) => {
  try {
    const { name, email, password, tenantSlug } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const normalizedTenantSlug = tenantSlug ? tenantSlug.toLowerCase().trim() : '';
    const tenant = await Tenant.findOne({ subdomain: normalizedTenantSlug });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenantId = tenant._id;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Default first users to QABILA_ADMIN or just MEMBER for now. Let's say MEMBER.
    const user = new User({
      name,
      email,
      passwordHash,
      role: UserRole.MEMBER,
      tenantId,
    });

    await user.save();

    const token = jwt.sign(buildSessionPayload(user), JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);

    res.status(201).json({ token, user: toSafeUser(user, normalizedTenantSlug) });
  } catch (error) {
    console.error('Registration error', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
router.post('/login', loginRateLimiter, sanitize, validate(loginSchema, 'body'), async (req: Request, res: Response) => {
  try {
    return loginWithScope(req, res, 'any');
  } catch (error) {
    console.error('Login error', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.post('/tenant/login', loginRateLimiter, sanitize, validate(loginSchema, 'body'), async (req: Request, res: Response) => {
  try {
    return loginWithScope(req, res, 'tenant');
  } catch (error) {
    console.error('Tenant login error', error);
    res.status(500).json({ error: 'Server error during tenant login' });
  }
});

router.post('/platform/login', loginRateLimiter, sanitize, validate(loginSchema, 'body'), async (req: Request, res: Response) => {
  try {
    return loginWithScope(req, res, 'platform');
  } catch (error) {
    console.error('Platform login error', error);
    res.status(500).json({ error: 'Server error during platform login' });
  }
});

// Get current user (protected)
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    // @ts-ignore - set by middleware
    const userId = req.user.id;
    const user = await User.findById(userId).select('-passwordHash');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const tenant = user.tenantId ? await Tenant.findById(user.tenantId).lean() : null;
    res.json(toSafeUser(user, tenant?.subdomain));
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching user profile' });
  }
});

router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    // @ts-ignore - set by middleware
    const userId = String(req.user.id || '');
    if (!userId) {
      return res.status(400).json({ error: 'User not found' });
    }

    await invalidateSessions(userId);
    clearAuthCookie(res);
    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error', error);
    return res.status(500).json({ error: 'Server error during logout' });
  }
});

router.post('/revoke-sessions', authenticate, async (req: Request, res: Response) => {
  try {
    // @ts-ignore - set by middleware
    const userId = String(req.user.id || '');
    if (!userId) {
      return res.status(400).json({ error: 'User not found' });
    }

    await invalidateSessions(userId);
    clearAuthCookie(res);
    return res.json({ message: 'All sessions revoked successfully' });
  } catch (error) {
    console.error('Session revocation error', error);
    return res.status(500).json({ error: 'Server error revoking sessions' });
  }
});

router.patch('/me', authenticate, sanitize, validate(updateProfileSchema, 'body'), async (req: Request, res: Response) => {
  try {
    // @ts-ignore - set by middleware
    const userId = req.user.id;
    const { name, phone, avatarUrl, bio, location } = req.body;

    const updates: Record<string, string> = {};
    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (typeof phone === 'string') updates.phone = phone.trim();
    if (typeof avatarUrl === 'string') updates.avatarUrl = avatarUrl.trim();
    if (typeof bio === 'string') updates.bio = bio.trim();
    if (typeof location === 'string') updates.location = location.trim();

    const updated = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-passwordHash');
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(toSafeUser(updated));
  } catch (error) {
    console.error('Profile update error', error);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

  /**
   * Request password reset
   * POST /auth/forgot-password
   */
  router.post('/forgot-password', sanitize, validate(forgotPasswordSchema, 'body'), async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        // Don't reveal if email exists (security)
        return res.json({ message: 'If email exists, password reset link has been sent' });
      }

      const { token, code, hash, expiry } = generatePasswordResetToken();

      // Save token hash to user
      await User.updateOne(
        { _id: user._id },
        {
          passwordResetToken: hash,
          passwordResetExpiry: expiry,
        }
      );

      // Send reset email
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const tenant = user.tenantId ? await Tenant.findById(user.tenantId) : null;
    
      await sendPasswordResetEmail(
        user.email,
        token,
        code,
        user.tenantId ? String(user.tenantId) : undefined,
        tenant?.name,
        appUrl
      );

      res.json({ message: 'Password reset link sent to email' });
    } catch (error) {
      console.error('Forgot password error', error);
      res.status(500).json({ error: 'Server error processing password reset' });
    }
  });

  /**
   * Reset password with token
   * POST /auth/reset-password
   */
  router.post('/reset-password', sanitize, validate(resetPasswordSchema, 'body'), async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;

        const tokenHash = hashToken(token);
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const user = await User.findOne({
          passwordResetToken: tokenHash,
          passwordResetExpiry: { $gt: nowInSeconds },
        });

      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      // Update password and clear reset token
      await User.updateOne(
        { _id: user._id },
        {
          $set: { passwordHash },
          $inc: { sessionVersion: 1 },
          $unset: {
            passwordResetToken: 1,
            passwordResetExpiry: 1,
          },
        }
      );

      res.json({ message: 'Password reset successful. You can now login with your new password' });
    } catch (error) {
      console.error('Reset password error', error);
      res.status(500).json({ error: 'Server error resetting password' });
    }
  });

  /**
   * Verify email address
   * POST /auth/verify-email
   */
  router.post('/verify-email', sanitize, validate(verifyEmailSchema, 'body'), async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

        const tokenHash = hashToken(token);
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const user = await User.findOne({
          emailVerificationToken: tokenHash,
          emailVerificationExpiry: { $gt: nowInSeconds },
        });

      if (!user) {
        return res.status(400).json({ error: 'Invalid verification token' });
      }

      // Mark email as verified and clear token
      await User.updateOne(
        { _id: user._id },
        {
          $set: { emailVerified: true },
          $unset: {
            emailVerificationToken: 1,
            emailVerificationExpiry: 1,
          },
        }
      );

      res.json({ message: 'Email verified successfully' });
    } catch (error) {
      console.error('Email verification error', error);
      res.status(500).json({ error: 'Server error verifying email' });
    }
  });

router.post('/send-verification', authenticate, async (req: Request, res: Response) => {
  try {
    // @ts-ignore - set by middleware
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    const { token, code, hash, expiry } = generateEmailVerificationToken();
    const tenant = user.tenantId ? await Tenant.findById(user.tenantId) : null;
    const appUrl = process.env.APP_URL || 'http://localhost:5173';

    await User.updateOne(
      { _id: user._id },
      {
        emailVerificationToken: hash,
        emailVerificationExpiry: expiry,
      }
    );

    await sendEmailVerificationEmail(
      user.email,
      token,
      code,
      user.tenantId ? String(user.tenantId) : undefined,
      tenant?.name,
      appUrl
    );

    return res.json({ message: 'Verification email sent' });
  } catch (error) {
    console.error('Send verification error', error);
    return res.status(500).json({ error: 'Server error sending verification email' });
  }
});

router.get('/email-preferences', authenticate, async (req: Request, res: Response) => {
  try {
    // @ts-ignore - set by middleware
    const userId = req.user.id;
    const user = await User.findById(userId).select('emailPreferences');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      emailPreferences: user.emailPreferences || {
        emailNotifications: true,
        eventReminders: true,
        announcements: true,
      },
    });
  } catch (error) {
    console.error('Get email preferences error', error);
    return res.status(500).json({ error: 'Server error fetching email preferences' });
  }
});

router.patch('/email-preferences', authenticate, sanitize, validate(emailPreferencesSchema, 'body'), async (req: Request, res: Response) => {
  try {
    // @ts-ignore - set by middleware
    const userId = req.user.id;
    const { emailNotifications, eventReminders, announcements } = req.body;

    const updates: Record<string, boolean> = {};
    if (typeof emailNotifications === 'boolean') updates['emailPreferences.emailNotifications'] = emailNotifications;
    if (typeof eventReminders === 'boolean') updates['emailPreferences.eventReminders'] = eventReminders;
    if (typeof announcements === 'boolean') updates['emailPreferences.announcements'] = announcements;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true }
    ).select('emailPreferences');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ message: 'Email preferences updated', emailPreferences: user.emailPreferences });
  } catch (error) {
    console.error('Update email preferences error', error);
    return res.status(500).json({ error: 'Server error updating email preferences' });
  }
});

router.get('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      return res.status(400).json({ error: 'Unsubscribe token is required' });
    }

    const payload = jwt.verify(token, JWT_SECRET) as {
      email?: string;
      type?: 'eventReminders' | 'announcements' | 'all';
      purpose?: string;
    };

    if (payload.purpose !== 'unsubscribe' || !payload.email) {
      return res.status(400).json({ error: 'Invalid unsubscribe token' });
    }

    const email = payload.email.toLowerCase().trim();
    const type = payload.type || 'all';

    const updates: Record<string, boolean> = {};
    if (type === 'all') {
      updates['emailPreferences.emailNotifications'] = false;
      updates['emailPreferences.eventReminders'] = false;
      updates['emailPreferences.announcements'] = false;
    } else if (type === 'eventReminders') {
      updates['emailPreferences.eventReminders'] = false;
    } else if (type === 'announcements') {
      updates['emailPreferences.announcements'] = false;
    }

    const user = await User.findOneAndUpdate(
      { email },
      { $set: updates },
      { new: true }
    ).select('email emailPreferences');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      message: 'Unsubscribe request processed successfully',
      email: user.email,
      emailPreferences: user.emailPreferences,
    });
  } catch (error) {
    console.error('Unsubscribe error', error);
    return res.status(400).json({ error: 'Invalid or expired unsubscribe token' });
  }
});

  /**
   * Change password (for authenticated users)
   * POST /auth/change-password
   */
  router.post('/change-password', authenticate, sanitize, validate(changePasswordSchema, 'body'), async (req: Request, res: Response) => {
    try {
      // @ts-ignore - set by middleware
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      // Update password
      await User.updateOne(
        { _id: userId },
        { $set: { passwordHash }, $inc: { sessionVersion: 1 } }
      );

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error', error);
      res.status(500).json({ error: 'Server error changing password' });
    }
  });

// Get branches/clans for a tenant
router.get('/branches/:tenantSlug', async (req, res) => {
  try {
    const tenantSlug = req.params.tenantSlug?.trim().toLowerCase();
    if (!tenantSlug) {
      return res.status(400).json({ error: 'Tenant slug is required' });
    }

    const tenant = await Tenant.findOne({ subdomain: tenantSlug });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

  const users = await User.find({ tenantId: tenant._id }).select('branchId').distinct('branchId');
    
    const branches = users.map(String).filter((b: string) => b && b !== 'undefined').sort();
    
    res.json({ 
      branches,
      tenantId: tenant._id,
      tenantSlug: tenant.subdomain
    });
  } catch (error) {
    console.error('Get branches error', error);
    res.status(500).json({ error: 'Server error fetching branches' });
  }
});

export default router;
