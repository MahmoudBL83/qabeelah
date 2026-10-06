import { Router } from 'express';
import bcryptjs from 'bcryptjs';
import { getTenantModels } from '../lib/tenantDb';
import { authenticate } from '../middleware/auth';
import { UserRole } from '../types/shared';
import { Tenant, User } from '../models';
import { logActivity } from './activities';
import { ActivityType } from '../models/Activity';
import { sendWelcomeEmail } from '../lib/mailer';
import { createNotification } from '../lib/notificationService';
import { validate, sanitize } from '../validation/middleware';
import { createRateLimiter, tenantIpWhitelist } from '../lib/security';
import {
  createJoinRequestSchema,
  decideJoinRequestSchema,
} from '../validation/schemas';

const router = Router();
const joinRequestLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 6, keyPrefix: 'join-request' });

router.use(tenantIpWhitelist());

// Get all join requests for a tenant (for tenant admin or super admin)
router.get('/:tenantId/all', authenticate, async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware
    const user = req.user as { role: UserRole; tenantId?: string };
    const requestedTenantId = String(req.params.tenantId).trim();
    
    // Verify access: super-admin or tenant admin of that tenant
    const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    const isTenantAdmin = user?.role === UserRole.QABILA_ADMIN && String(user?.tenantId) === requestedTenantId;
    
    if (!isSuperAdmin && !isTenantAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { JoinRequest } = await getTenantModels(requestedTenantId);
    const requests = await JoinRequest.find({ tenantId: requestedTenantId })
      .sort({ createdAt: -1 })
      .lean();

    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch join requests' });
  }
});

// Get specific join request details
router.get('/:tenantId/:requestId', authenticate, async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware
    const user = req.user as { role: UserRole; tenantId?: string };
    const requestedTenantId = String(req.params.tenantId).trim();
    const requestId = String(req.params.requestId).trim();
    
    const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    const isTenantAdmin = user?.role === UserRole.QABILA_ADMIN && String(user?.tenantId) === requestedTenantId;
    
    if (!isSuperAdmin && !isTenantAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { JoinRequest } = await getTenantModels(requestedTenantId);
    const request = await JoinRequest.findById(requestId).lean();

    if (!request) {
      return res.status(404).json({ error: 'Join request not found' });
    }

    res.json(request);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch join request' });
  }
});

// Approve a join request
router.patch('/:tenantId/:requestId/approve', authenticate, sanitize, validate(decideJoinRequestSchema, 'body'), async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware
    const user = req.user as { role: UserRole; tenantId?: string };
    const requestedTenantId = String(req.params.tenantId).trim();
    const requestId = String(req.params.requestId).trim();
    const { parentId, addToTree } = req.body;
    
    const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    const isTenantAdmin = user?.role === UserRole.QABILA_ADMIN && String(user?.tenantId) === requestedTenantId;
    
    if (!isSuperAdmin && !isTenantAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { JoinRequest, Person } = await getTenantModels(requestedTenantId);
    const updated = await JoinRequest.findByIdAndUpdate(
      requestId,
      {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedBy: user?.role
      },
      { new: true }
    ).lean() as unknown as {
      _id: any;
      tenantId: string;
      fullName: string;
      email: string;
      phone?: string;
      status?: string;
      reviewedAt?: Date | null;
    } | null;

    if (!updated) {
      return res.status(404).json({ error: 'Join request not found' });
    }

    // Add to family tree if requested
    if (addToTree && parentId && updated.fullName) {
      try {
        const nameParts = updated.fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const parent = await Person.findById(parentId);
        if (!parent || String(parent.tenantId) !== requestedTenantId) {
          return res.status(400).json({ error: 'Parent not found or invalid tenant' });
        }

        await Person.create({
          tenantId: requestedTenantId,
          firstName,
          lastName,
          parentId,
          branchId: parent.branchId || 'الفرع الرئيسي'
        });
      } catch (treeErr) {
        console.error('Failed to add person to tree:', treeErr);
        // Don't fail the approval if tree addition fails
      }
    }

    // Auto-create user account after approval and send welcome email
    let createdUserId: string | undefined;
    let newUserPassword: string | undefined;
    try {
      const User = require('../models').User;
      const existingUser = await User.findOne({ email: updated.email });
      
      if (!existingUser) {
        newUserPassword = Math.random().toString(36).slice(-10);
        const bcryptjs = require('bcryptjs');
        const newUser = new User({
          email: updated.email,
          name: updated.fullName,
          phone: updated.phone,
          tenantId: requestedTenantId,
          role: UserRole.MEMBER,
          passwordHash: bcryptjs.hashSync(newUserPassword, 8)
        });
        await newUser.save();
        createdUserId = newUser._id.toString();

        // Send welcome email (non-blocking)
        try {
          const tenant = await Tenant.findById(requestedTenantId).lean();
          await sendWelcomeEmail(updated.email, newUserPassword, requestedTenantId, tenant?.name);
        } catch (mailErr) {
          console.error('Failed to send welcome email:', mailErr);
        }
      } else {
        createdUserId = existingUser._id.toString();
      }
    } catch (createUserError) {
      console.error('Failed to auto-create user after approval:', createUserError);
      // Don't fail the approval if user creation fails
    }

    // Log activity: Member Approved
    if (createdUserId) {
      logActivity(
        requestedTenantId,
        ActivityType.MEMBER_APPROVED,
        createdUserId,
        undefined,
        'User',
        `${updated.fullName} was approved to join`
      );

      await createNotification({
        userId: createdUserId,
        tenantId: requestedTenantId,
        type: 'join_request_approved',
        title: 'تم قبول طلب الانضمام',
        body: 'تمت الموافقة على طلب انضمامك إلى القبيلة.',
        data: { requestId, tenantId: requestedTenantId },
        push: true,
      });
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to approve join request' });
  }
});

// Reject a join request
router.patch('/:tenantId/:requestId/reject', authenticate, sanitize, validate(decideJoinRequestSchema, 'body'), async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware
    const user = req.user as { role: UserRole; tenantId?: string };
    const requestedTenantId = String(req.params.tenantId).trim();
    const requestId = String(req.params.requestId).trim();
    
    const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    const isTenantAdmin = user?.role === UserRole.QABILA_ADMIN && String(user?.tenantId) === requestedTenantId;
    
    if (!isSuperAdmin && !isTenantAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { JoinRequest } = await getTenantModels(requestedTenantId);
    const updated = await JoinRequest.findByIdAndUpdate(
      requestId,
      {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: user?.role
      },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: 'Join request not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reject join request' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const tenantId = String(req.query.tenantId || '').trim();
    const email = String(req.query.email || '').trim().toLowerCase();

    if (!tenantId || !email) {
      return res.status(400).json({ error: 'tenantId and email are required' });
    }

    const { JoinRequest } = await getTenantModels(tenantId);
    const joinRequest = await JoinRequest.findOne({ tenantId, email }).lean<{
      status: string;
      reviewedAt?: Date | null;
      fullName: string;
      email: string;
    }>();

    if (!joinRequest) {
      return res.status(404).json({ error: 'Join request not found' });
    }

    res.json({
      status: joinRequest.status,
      reviewedAt: joinRequest.reviewedAt,
      fullName: joinRequest.fullName,
      email: joinRequest.email
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch join request status' });
  }
});

router.post('/', joinRequestLimiter, sanitize, validate(createJoinRequestSchema, 'body'), async (req, res) => {
  try {
    console.log('[joinRequests POST] ===== START =====');
    console.log('[joinRequests POST] Raw request body:', JSON.stringify(req.body));
    
    const { tenantId, fullName, email, phone, password, relationship, message } = req.body;

    console.log('[joinRequests POST] Extracted fields:', {
      tenantId,
      fullName,
      email,
      phone,
      password: '***',
      relationship,
      message,
    });

    if (!tenantId) {
      console.error('[joinRequests POST] Missing tenantId');
      return res.status(400).json({ error: 'Missing tenantId' });
    }

    console.log('[joinRequests POST] Fetching models for tenant:', tenantId);
    const { JoinRequest } = await getTenantModels(String(tenantId));
    console.log('[joinRequests POST] Models fetched successfully');

    // First, create the user account
    console.log('[joinRequests POST] Creating user account...');
    const passwordHash = await bcryptjs.hash(password, 10);
    
    const user = await User.create({
      name: fullName,
      email: email.toLowerCase(),
      passwordHash,
      phone,
      role: UserRole.MEMBER,
      tenantId: String(tenantId),
      isVerified: false // User will be marked as verified after join request approval
    });
    
    console.log('[joinRequests POST] User account created:', { userId: user._id, email: user.email });

    // Then create the join request
    const createPayload = {
      tenantId,
      fullName,
      email,
      phone,
      relationship,
      notes: message
    };
    
    console.log('[joinRequests POST] Attempting to create JoinRequest with:', JSON.stringify(createPayload));

    const joinRequest = await JoinRequest.create(createPayload);

    console.log('[joinRequests POST] Successfully created request:', { _id: joinRequest._id, email: joinRequest.email });
    console.log('[joinRequests POST] ===== END =====');
    res.status(201).json({
      joinRequest,
      message: 'تم إنشاء الحساب بنجاح! يمكنك الآن تسجيل الدخول بانتظار اعتماد طلب الانضمام.'
    });
  } catch (error) {
    console.error('[joinRequests POST] ===== ERROR =====');
    console.error('[joinRequests POST] Error type:', error?.constructor?.name);
    
    if (error instanceof Error) {
      console.error('[joinRequests POST] Error name:', error.name);
      console.error('[joinRequests POST] Error message:', error.message);
      console.error('[joinRequests POST] Error stack:', error.stack);
      
      // Mongoose validation errors
      if ('errors' in error) {
        console.error('[joinRequests POST] Mongoose validation errors:', JSON.stringify(error.errors, null, 2));
      }
    }
    
    console.error('[joinRequests POST] Full error object:', error);
    console.error('[joinRequests POST] ===== END ERROR =====');
    
    res.status(500).json({
      error: 'Failed to submit join request',
      details: error instanceof Error ? error.message : 'Unknown error',
      errorType: error?.constructor?.name || 'Unknown',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
