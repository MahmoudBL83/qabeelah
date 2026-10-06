import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';
import { Notification, User } from '../models';
import { addNotificationSubscriber } from '../lib/notificationRealtime';
import { getWebPushPublicKey } from '../lib/webPush';
import { getJwtSecret } from '../lib/jwtSecret';

const router = Router();
const JWT_SECRET = getJwtSecret();

type AuthUser = {
  id: string;
  role?: string;
  tenantId?: string;
};

const verifyStreamToken = (token: string) => jwt.verify(token, JWT_SECRET) as AuthUser;

router.get('/stream', async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || '');
    const tenantId = String(req.query.tenantId || '');
    if (!token || !tenantId) {
      return res.status(400).json({ error: 'token and tenantId are required' });
    }

    const user = verifyStreamToken(token);
    if (String(user.tenantId || '') !== tenantId && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(': connected\n\n');
    addNotificationSubscriber({ tenantId, userId: user.id }, res);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid stream token' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user as AuthUser;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);

    const items = await Notification.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments({ userId: user.id });
    res.json({ data: items, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notifications as read
router.post('/mark-read', authenticate, async (req, res) => {
  try {
    const ids: string[] = req.body.ids || [];
    if (!Array.isArray(ids) || ids.length === 0) return res.json({ updated: 0 });

    const result = await Notification.updateMany(
      { _id: { $in: ids } },
      { $set: { read: true } }
    );

    res.json({ updated: result.modifiedCount || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

// Register push token for current user
router.post('/register-token', authenticate, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user;
    const { token, provider = 'expo' } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const doc = await User.findById(user.id);
    if (!doc) return res.status(404).json({ error: 'User not found' });

    doc.pushTokens = doc.pushTokens || [];
    const exists = doc.pushTokens.some((entry: any) => entry.token === token);
    if (!exists) {
      doc.pushTokens.push({ token, provider, createdAt: new Date() } as any);
      await doc.save();
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register token' });
  }
});

router.get('/web-push-key', authenticate, async (_req, res) => {
  const publicKey = getWebPushPublicKey();
  if (!publicKey) {
    return res.status(503).json({ error: 'Web push is not configured' });
  }

  return res.json({ publicKey });
});

router.post('/register-web-subscription', authenticate, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user;
    const subscription = req.body?.subscription;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription payload' });
    }

    const doc = await User.findById(user.id);
    if (!doc) return res.status(404).json({ error: 'User not found' });

    await User.updateMany(
      { _id: { $ne: user.id }, 'webPushSubscriptions.endpoint': subscription.endpoint },
      { $pull: { webPushSubscriptions: { endpoint: subscription.endpoint } } }
    );

    doc.webPushSubscriptions = doc.webPushSubscriptions || [];
    doc.webPushSubscriptions = doc.webPushSubscriptions.filter(
      (entry: any) => entry?.endpoint !== subscription.endpoint
    );
    doc.webPushSubscriptions.push({
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      createdAt: new Date(),
    } as any);
    await doc.save();

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to register web subscription' });
  }
});

router.post('/unregister-web-subscription', authenticate, async (req, res) => {
  try {
    // @ts-ignore
    const user = req.user;
    const endpoint = String(req.body?.endpoint || '');
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }

    await User.updateOne(
      { _id: user.id },
      { $pull: { webPushSubscriptions: { endpoint } } }
    );

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to unregister web subscription' });
  }
});

export default router;
