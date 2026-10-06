import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';
import { ConversationState, Message, User } from '../models';
import { UserRole } from '../types/shared';
import { addMessageSubscriber, broadcastMessageEvent } from '../lib/messageRealtime';
import { createNotification } from '../lib/notificationService';
import { getJwtSecret } from '../lib/jwtSecret';

const router = Router();
const JWT_SECRET = getJwtSecret();

type AuthUser = {
  id: string;
  role: UserRole;
  tenantId?: string;
  branchId?: string;
};

export const DEFAULT_BRANCH_ID = 'الفرع الرئيسي';

const isAdminRole = (role?: UserRole) => role === UserRole.QABILA_ADMIN || role === UserRole.SUB_ADMIN;
const isSubAdminRole = (role?: UserRole) => role === UserRole.SUB_ADMIN;

const canAccessTenant = (user: AuthUser, tenantId: string) =>
  user.role === UserRole.SUPER_ADMIN || String(user.tenantId || '') === String(tenantId);

export const resolveBranchForUser = (user: AuthUser, requestedBranchId?: string) => {
  if (isSubAdminRole(user.role)) {
    return user.branchId || DEFAULT_BRANCH_ID;
  }
  if (isAdminRole(user.role) || user.role === UserRole.SUPER_ADMIN) {
    return requestedBranchId || user.branchId || DEFAULT_BRANCH_ID;
  }
  return user.branchId || DEFAULT_BRANCH_ID;
};

const directConversationKey = (userA: string, userB: string) =>
  [`direct`, [userA, userB].sort().join(':')].join(':');

const branchConversationKey = (tenantId: string, branchId: string) =>
  `branch:${tenantId}:${branchId || DEFAULT_BRANCH_ID}`;

const announcementConversationKey = (tenantId: string) =>
  `announcement:${tenantId}`;

export const getConversationKey = (scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT', userId: string, targetUserId?: string, tenantId?: string, branchId?: string) => {
  if (scope === 'DIRECT' && targetUserId) return directConversationKey(userId, targetUserId);
  if (scope === 'BRANCH' && tenantId) return branchConversationKey(tenantId, branchId || DEFAULT_BRANCH_ID);
  if (scope === 'ANNOUNCEMENT' && tenantId) return announcementConversationKey(tenantId);
  return '';
};

const upsertReadState = async (params: {
  tenantId: string;
  userId: string;
  scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
  targetUserId?: string;
  branchId?: string;
}) => {
  const conversationKey = getConversationKey(params.scope, params.userId, params.targetUserId, params.tenantId, params.branchId);
  if (!conversationKey) return;

  await ConversationState.findOneAndUpdate(
    {
      tenantId: params.tenantId,
      userId: params.userId,
      conversationKey,
    },
    {
      $set: {
        scope: params.scope,
        targetUserId: params.targetUserId,
        branchId: params.branchId,
        lastReadAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
};

export const buildUnreadMessageQuery = (params: {
  tenantId: string;
  userId: string;
  scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
  targetUserId?: string;
  branchId?: string;
}, lastReadAt: Date) => {
  const query: Record<string, any> = {
    tenantId: params.tenantId,
    scope: params.scope,
    createdAt: { $gt: lastReadAt },
  };

  if (params.scope === 'DIRECT' && params.targetUserId) {
    query.recipientUserId = params.userId;
    query.senderId = params.targetUserId;
  }

  if (params.scope === 'BRANCH') {
    query.branchId = params.branchId || DEFAULT_BRANCH_ID;
    query.senderId = { $ne: params.userId };
  }

  if (params.scope === 'ANNOUNCEMENT') {
    query.senderId = { $ne: params.userId };
    query.$or = [{ branchId: { $exists: false } }, { branchId: '' }, { branchId: params.branchId || DEFAULT_BRANCH_ID }];
  }

  return query;
};

const getUnreadCountForConversation = async (params: {
  tenantId: string;
  userId: string;
  scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
  targetUserId?: string;
  branchId?: string;
}) => {
  const conversationKey = getConversationKey(params.scope, params.userId, params.targetUserId, params.tenantId, params.branchId);
  const state = conversationKey
    ? await ConversationState.findOne({ tenantId: params.tenantId, userId: params.userId, conversationKey }).lean()
    : null;
  const lastReadAt = state?.lastReadAt || new Date(0);

  const query = buildUnreadMessageQuery(params, lastReadAt);

  return Message.countDocuments(query);
};

const verifyStreamToken = (token: string) => {
  const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
  return decoded;
};

router.get('/stream', async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || '');
    const tenantId = String(req.query.tenantId || '');
    const scope = String(req.query.scope || '').toUpperCase() as 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
    const targetUserId = req.query.targetUserId ? String(req.query.targetUserId) : undefined;
    const branchId = req.query.branchId ? String(req.query.branchId) : undefined;

    if (!token || !tenantId || !scope) {
      return res.status(400).json({ error: 'token, tenantId, and scope are required' });
    }

    const user = verifyStreamToken(token);
    if (!canAccessTenant(user, tenantId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (scope === 'BRANCH') {
      const effectiveBranchId = resolveBranchForUser(user, branchId);
      if (isSubAdminRole(user.role) && effectiveBranchId !== (user.branchId || DEFAULT_BRANCH_ID)) {
        return res.status(403).json({ error: 'Sub-admin can only access own branch stream' });
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(': connected\n\n');

    addMessageSubscriber(
      {
        tenantId,
        scope,
        userId: user.id,
        targetUserId,
        branchId,
      },
      res
    );
  } catch (error) {
    console.error(error);
    return res.status(401).json({ error: 'Invalid stream token' });
  }
});

router.get('/participants', authenticate, async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.query.tenantId || '');
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const user = (req as any).user as AuthUser;
    if (!canAccessTenant(user, tenantId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const participants = await User.find({ tenantId })
      .select('_id name email role branchId')
      .sort({ name: 1 })
      .lean();

    return res.json(participants);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.query.tenantId || '');
    const scope = String(req.query.scope || '').toUpperCase();
    const targetUserId = String(req.query.targetUserId || '');
    const requestedBranchId = String(req.query.branchId || '');
    const limit = Math.min(Number(req.query.limit || 100), 200);

    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
    if (!['DIRECT', 'BRANCH', 'ANNOUNCEMENT'].includes(scope)) {
      return res.status(400).json({ error: 'scope must be DIRECT, BRANCH, or ANNOUNCEMENT' });
    }

    const user = (req as any).user as AuthUser;
    if (!canAccessTenant(user, tenantId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const query: Record<string, any> = {
      tenantId,
      scope,
      ...(isAdminRole(user.role) ? {} : { isHidden: false }),
    };

    if (scope === 'DIRECT') {
      if (!targetUserId) {
        return res.status(400).json({ error: 'targetUserId is required for direct messages' });
      }

      query.$or = [
        { senderId: user.id, recipientUserId: targetUserId },
        { senderId: targetUserId, recipientUserId: user.id },
      ];
    }

    if (scope === 'BRANCH') {
      const branchId = resolveBranchForUser(user, requestedBranchId);
      query.branchId = branchId;
    }

    if (scope === 'ANNOUNCEMENT' && !isAdminRole(user.role)) {
      query.$or = [{ branchId: { $exists: false } }, { branchId: '' }, { branchId: user.branchId || 'الفرع الرئيسي' }];
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    await upsertReadState({
      tenantId,
      userId: user.id,
      scope: scope as 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT',
      targetUserId: scope === 'DIRECT' ? targetUserId : undefined,
      branchId: scope === 'BRANCH' ? resolveBranchForUser(user, requestedBranchId) : undefined,
    });

    return res.json(messages.reverse());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.get('/conversations', authenticate, async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.query.tenantId || '');
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const user = (req as any).user as AuthUser;
    if (!canAccessTenant(user, tenantId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const members = await User.find({ tenantId, _id: { $ne: user.id } })
      .select('_id name branchId')
      .lean();

    const direct = await Promise.all(members.map(async (member) => {
      const lastMessage = await Message.findOne({
        tenantId,
        scope: 'DIRECT',
        $or: [
          { senderId: user.id, recipientUserId: member._id },
          { senderId: member._id, recipientUserId: user.id },
        ],
      })
        .sort({ createdAt: -1 })
        .select('senderId content createdAt isHidden')
        .lean();

      const unreadCount = await getUnreadCountForConversation({
        tenantId,
        userId: user.id,
        scope: 'DIRECT',
        targetUserId: String(member._id),
      });

      const otherConversationKey = directConversationKey(String(member._id), user.id);
      const otherState = await ConversationState.findOne({
        tenantId,
        userId: member._id,
        conversationKey: otherConversationKey,
      }).select('lastReadAt').lean();

      return {
        scope: 'DIRECT' as const,
        targetUserId: String(member._id),
        targetName: member.name,
        unreadCount,
        otherReadAt: otherState?.lastReadAt || null,
        lastMessage: lastMessage
          ? {
              content: lastMessage.isHidden ? 'رسالة مخفية' : String(lastMessage.content || ''),
              createdAt: lastMessage.createdAt,
              senderName: String(lastMessage.senderId) === user.id ? 'أنت' : member.name,
            }
          : null,
      };
    }));

    const branchId = user.branchId || DEFAULT_BRANCH_ID;
    const branchLastMessage = await Message.findOne({
      tenantId,
      scope: 'BRANCH',
      branchId,
    })
      .sort({ createdAt: -1 })
      .select('senderId content createdAt isHidden')
      .lean();

    const branchUnreadCount = await getUnreadCountForConversation({
      tenantId,
      userId: user.id,
      scope: 'BRANCH',
      branchId,
    });

    const announcementLastMessage = await Message.findOne({
      tenantId,
      scope: 'ANNOUNCEMENT',
      $or: [{ branchId: { $exists: false } }, { branchId: '' }, { branchId }],
    })
      .sort({ createdAt: -1 })
      .select('senderId content createdAt isHidden')
      .lean();

    const announcementUnreadCount = await getUnreadCountForConversation({
      tenantId,
      userId: user.id,
      scope: 'ANNOUNCEMENT',
      branchId,
    });

    const branchState = await ConversationState.findOne({
      tenantId,
      userId: user.id,
      conversationKey: branchConversationKey(tenantId, branchId),
    }).select('lastReadAt').lean();

    const announcementState = await ConversationState.findOne({
      tenantId,
      userId: user.id,
      conversationKey: announcementConversationKey(tenantId),
    }).select('lastReadAt').lean();

    return res.json({
      direct,
      branch: {
        branchId,
        unreadCount: branchUnreadCount,
        lastReadAt: branchState?.lastReadAt || null,
        lastMessage: branchLastMessage
          ? {
              content: branchLastMessage.isHidden ? 'رسالة مخفية' : String(branchLastMessage.content || ''),
              createdAt: branchLastMessage.createdAt,
              senderName: String(branchLastMessage.senderId) === user.id ? 'أنت' : 'الفرع',
            }
          : null,
      },
      announcement: {
        unreadCount: announcementUnreadCount,
        lastReadAt: announcementState?.lastReadAt || null,
        lastMessage: announcementLastMessage
          ? {
              content: announcementLastMessage.isHidden ? 'رسالة مخفية' : String(announcementLastMessage.content || ''),
              createdAt: announcementLastMessage.createdAt,
              senderName: String(announcementLastMessage.senderId) === user.id ? 'أنت' : 'الإعلانات',
            }
          : null,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

router.post('/read', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const tenantId = String(req.body?.tenantId || '');
    const scope = String(req.body?.scope || '').toUpperCase() as 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
    const targetUserId = req.body?.targetUserId ? String(req.body.targetUserId) : undefined;
    const requestedBranchId = req.body?.branchId ? String(req.body.branchId) : undefined;

    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
    if (!canAccessTenant(user, tenantId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await upsertReadState({
      tenantId,
      userId: user.id,
      scope,
      targetUserId,
      branchId: scope === 'BRANCH' ? resolveBranchForUser(user, requestedBranchId) : requestedBranchId,
    });

    return res.json({ message: 'Conversation marked as read' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to mark conversation as read' });
  }
});

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    const tenantId = String(req.body?.tenantId || '');
    const scope = String(req.body?.scope || '').toUpperCase();
    const content = String(req.body?.content || '').trim();
    const targetUserId = req.body?.targetUserId ? String(req.body.targetUserId) : undefined;
    const requestedBranchId = req.body?.branchId ? String(req.body.branchId) : undefined;

    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
    if (!canAccessTenant(user, tenantId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!['DIRECT', 'BRANCH', 'ANNOUNCEMENT'].includes(scope)) {
      return res.status(400).json({ error: 'scope must be DIRECT, BRANCH, or ANNOUNCEMENT' });
    }
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const payload: Record<string, any> = {
      tenantId,
      senderId: user.id,
      scope,
      content,
    };

    if (scope === 'DIRECT') {
      if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required for direct messages' });
      const targetUser = await User.findOne({ _id: targetUserId, tenantId }).select('_id').lean();
      if (!targetUser) {
        return res.status(404).json({ error: 'Direct message target not found in tenant' });
      }
      payload.recipientUserId = targetUserId;
    }

    if (scope === 'BRANCH') {
      payload.branchId = resolveBranchForUser(user, requestedBranchId);
    }

    if (scope === 'ANNOUNCEMENT') {
      if (!isAdminRole(user.role) && user.role !== UserRole.SUPER_ADMIN) {
        return res.status(403).json({ error: 'Only admins can post announcements' });
      }
      payload.branchId = requestedBranchId || undefined;
    }

    const created = await Message.create(payload);
    broadcastMessageEvent({ type: 'message.created', payload: created.toObject() });

    if (scope === 'DIRECT' && targetUserId) {
      await createNotification({
        userId: targetUserId,
        tenantId,
        type: 'direct_message',
        title: 'رسالة جديدة',
        body: content.slice(0, 140),
        data: { messageId: created._id.toString(), tenantId, scope, targetUserId: user.id },
        url: `/messages?scope=DIRECT&targetUserId=${encodeURIComponent(user.id)}`,
        push: true,
      });
    }

    return res.status(201).json(created);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

router.patch('/:id/moderate', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser;
    if (!isAdminRole(user.role) && user.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ error: 'Only admins can moderate messages' });
    }

    const { hidden, reason } = req.body || {};
    if (typeof hidden !== 'boolean') {
      return res.status(400).json({ error: 'hidden (boolean) is required' });
    }

    const existing = await Message.findById(req.params.id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!canAccessTenant(user, String(existing.tenantId))) {
      return res.status(403).json({ error: 'Access denied for this message tenant' });
    }

    if (isSubAdminRole(user.role)) {
      if (existing.scope !== 'BRANCH') {
        return res.status(403).json({ error: 'Sub-admin can only moderate branch messages' });
      }
      if (String(existing.branchId || DEFAULT_BRANCH_ID) !== String(user.branchId || DEFAULT_BRANCH_ID)) {
        return res.status(403).json({ error: 'Sub-admin can only moderate own branch messages' });
      }
    }

    const update: Record<string, any> = {
      isHidden: hidden,
      moderatedBy: new mongoose.Types.ObjectId(user.id),
      moderatedAt: new Date(),
      moderationReason: typeof reason === 'string' ? reason.trim().slice(0, 300) : undefined,
    };

    const updated = await Message.findByIdAndUpdate(req.params.id, update, { new: true }).lean();

    broadcastMessageEvent({ type: 'message.updated', payload: updated });

    return res.json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to moderate message' });
  }
});

export default router;
