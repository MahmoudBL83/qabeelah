import { Router } from 'express';
import { getTenantModels } from '../lib/tenantDb';
import { authenticate } from '../middleware/auth';
import { UserRole } from '../types/shared';
import { logActivity } from './activities';
import { ActivityType } from '../models/Activity';
import User from '../models/User';
import Tenant from '../models/Tenant';
import { sendLineageVerifiedEmail, sendLineageRejectedEmail } from '../lib/mailer';
import { createRateLimiter, tenantIpWhitelist } from '../lib/security';
import { createNotification } from '../lib/notificationService';

const router = Router();
const lineageRequestLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'lineage-request' });

router.use(tenantIpWhitelist());

type LineageAuthUser = {
  role: UserRole;
  tenantId?: string;
  id?: string;
  branchId?: string;
};

type PopulatedUser = {
  _id?: string;
  name?: string;
  email?: string;
  phone?: string;
};

type LineageRequestRecord = {
  status: 'unverified' | 'pending' | 'verified' | 'rejected';
  reviewedAt?: Date | null;
  notes?: string;
  documents?: string[];
  userId?: string | PopulatedUser;
};

// Admin: list all lineage requests for a tenant
router.get('/:tenantId/all', authenticate, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user as LineageAuthUser;
    const requestedTenantId = String(req.params.tenantId).trim();

    const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    const isTenantAdmin = user?.role === UserRole.QABILA_ADMIN && String(user?.tenantId) === requestedTenantId;
    const isSubAdmin = user?.role === UserRole.SUB_ADMIN && String(user?.tenantId) === requestedTenantId;
    if (!isSuperAdmin && !isTenantAdmin && !isSubAdmin) return res.status(403).json({ error: 'Access denied' });

    const { LineageVerification } = await getTenantModels(requestedTenantId);
    let query: Record<string, any> = { tenantId: requestedTenantId };

    // Sub-admins can only see requests from users in their own branch
    if (isSubAdmin && user?.branchId) {
      const branchUsers = await User.find({ tenantId: requestedTenantId, branchId: user.branchId || 'الفرع الرئيسي' }).select('_id').lean();
      const branchUserIds = branchUsers.map((u: any) => u._id);
      query.userId = { $in: branchUserIds };
    }

    const list = await LineageVerification.find(query)
      .populate('userId', 'name email phone branchId')
      .sort({ createdAt: -1 })
      .lean();
    res.json(list);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch lineage requests' });
  }
});

// Get lineage status by tenantId and userId
router.get('/status', authenticate, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user as LineageAuthUser;
    const tenantId = String(req.query.tenantId || '').trim();
    const userId = String(req.query.userId || '').trim();

    if (!tenantId || !userId) return res.status(400).json({ error: 'tenantId and userId are required' });

    const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    const isTenantAdmin = user?.role === UserRole.QABILA_ADMIN && String(user?.tenantId) === tenantId;
    const isSelf = String(user?.id || '') === userId;

    if (!isSuperAdmin && !isTenantAdmin && !isSelf) return res.status(403).json({ error: 'Access denied' });

    const { LineageVerification } = await getTenantModels(tenantId);
    const doc = (await LineageVerification.findOne({ tenantId, userId }).populate('userId', 'name email phone').lean()) as LineageRequestRecord | null;
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ status: doc.status, reviewedAt: doc.reviewedAt, notes: doc.notes, documents: doc.documents });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch lineage request' });
  }
});

// Admin: verify / reject / mark pending
router.patch('/:tenantId/:requestId/verify', authenticate, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user as LineageAuthUser;
    const requestedTenantId = String(req.params.tenantId).trim();
    const requestId = String(req.params.requestId).trim();
    const { status, notes } = req.body;

    const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
    const isTenantAdmin = user?.role === UserRole.QABILA_ADMIN && String(user?.tenantId) === requestedTenantId;
    if (!isSuperAdmin && !isTenantAdmin) return res.status(403).json({ error: 'Access denied' });

    if (!['unverified', 'pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { LineageVerification } = await getTenantModels(requestedTenantId as string);
    const updated = (await LineageVerification.findByIdAndUpdate(
      requestId,
      { status, notes: notes || '', reviewedBy: user?.id || user?.role, reviewedAt: new Date() },
      { new: true }
    ).populate('userId', 'name email phone').lean()) as LineageRequestRecord | null;

    if (!updated) return res.status(404).json({ error: 'Request not found' });

    // Log activity
    try {
      logActivity(requestedTenantId, ActivityType.PROFILE_UPDATED, user?.id || '', undefined, 'User', `Lineage status set to ${status}`);
    } catch (e) {
      // ignore
    }

    try {
      const tenant = await Tenant.findById(requestedTenantId).lean();
      const member = await User.findById(updated.userId).lean();
      if (member?.email) {
        if (status === 'verified') {
          await sendLineageVerifiedEmail(member.email, member.name || 'العضو', tenant?.name || 'قبيلة', updated.notes || undefined);
        } else if (status === 'rejected') {
          await sendLineageRejectedEmail(member.email, member.name || 'العضو', tenant?.name || 'قبيلة', updated.notes || undefined);
        }
      }
    } catch (mailError) {
      console.error('Failed to send lineage status email:', mailError);
    }

    try {
      const recipientId = typeof updated.userId === 'string' ? updated.userId : String((updated.userId as PopulatedUser)?._id || '');
      if (recipientId) {
        await createNotification({
          userId: recipientId,
          tenantId: requestedTenantId,
          type: `lineage_request_${status}`,
          title:
            status === 'verified'
              ? 'تم اعتماد التحقق من النسب'
              : status === 'rejected'
                ? 'تم رفض التحقق من النسب'
                : 'تمت مراجعة طلب التحقق من النسب',
          body:
            status === 'verified'
              ? 'تم اعتماد طلب التحقق من النسب الخاص بك.'
              : status === 'rejected'
                ? 'تم رفض طلب التحقق من النسب الخاص بك.'
                : 'تم تحديث حالة طلب التحقق من النسب.',
          data: { tenantId: requestedTenantId, requestId, status },
          push: true,
          url: `/profile?lineageRequestId=${encodeURIComponent(requestId)}&status=${encodeURIComponent(status)}`,
        });
      }
    } catch (notifyError) {
      console.error('Failed to notify user about lineage status:', notifyError);
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update lineage request' });
  }
});

// Submit a lineage request (user)
router.post('/', lineageRequestLimiter, authenticate, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user as LineageAuthUser;
    const { tenantId, documents } = req.body;

    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
    if (!user?.id) return res.status(400).json({ error: 'User not found' });

    const submitter = await User.findById(user.id).lean();

    const { LineageVerification } = await getTenantModels(String(tenantId));

    // Upsert: single request per user for now
    const existing = await LineageVerification.findOne({ tenantId, userId: user.id });
    if (existing) {
      existing.documents = Array.isArray(documents) ? documents : existing.documents;
      existing.status = 'pending';
      await existing.save();
      return res.json(existing);
    }

    const created = await LineageVerification.create({ tenantId, userId: user.id, documents: Array.isArray(documents) ? documents : [], status: 'pending' });

    try {
      const admins = await User.find({
        tenantId,
        role: { $in: [UserRole.QABILA_ADMIN, UserRole.SUB_ADMIN] },
        _id: { $ne: user.id },
      }).lean();

      await Promise.allSettled(
        admins.map((admin: any) =>
          createNotification({
            userId: String(admin._id),
            tenantId,
            type: 'lineage_request_pending',
            title: 'طلب تحقق من النسب جديد',
            body: `${submitter?.name || submitter?.email || 'مستخدم'} أرسل طلب تحقق من النسب.`,
            data: { tenantId, requestId: created._id.toString(), status: 'pending' },
            push: true,
            url: `/admin/approvals?lineageRequestId=${encodeURIComponent(created._id.toString())}`,
          })
        )
      );
    } catch (notifyError) {
      console.error('Failed to notify admins about new lineage request:', notifyError);
    }

    res.status(201).json(created);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit lineage request' });
  }
});

export default router;
