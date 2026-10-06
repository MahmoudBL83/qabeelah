import { Router, Request, Response } from 'express';
import { getTenantModels } from '../lib/tenantDb';
import { ActivityType } from '../models/Activity';
import ActivityModel, { IActivity } from '../models/Activity';
import User from '../models/User';

const router = Router();

// Get recent activities for a tenant
router.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId || typeof tenantId !== 'string') {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = parseInt(req.query.skip as string) || 0;

    const activities = (await ActivityModel.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean()) as unknown as IActivity[];

    // Populate user name
    const enriched = await Promise.all(
      activities.map(async (activity: IActivity) => {
        const user = await User.findById(activity.userId).lean();
        return {
          ...activity,
          userName: user?.name || 'Unknown',
          userAvatar: user?.avatarUrl
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Helper function to log activities (called from other routes)
export async function logActivity(
  tenantId: string,
  type: ActivityType,
  userId: string,
  relatedEntityId?: string,
  relatedEntityType?: string,
  description?: string,
  metadata?: Record<string, any>
) {
  try {
    const newActivity = new ActivityModel({
      tenantId,
      type,
      userId,
      relatedEntityId,
      relatedEntityType,
      description,
      metadata
    });
    await newActivity.save();
  } catch (err) {
    console.error('Failed to log activity:', err);
    // Non-blocking error
  }
}

export default router;
