import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getTenantModels } from '../lib/tenantDb';
import { logActivity } from './activities';
import { ActivityType } from '../models/Activity';
import { IEvent } from '../models/Event';

const router = Router();

const normalizeEventStatus = (event: Pick<IEvent, 'status' | 'eventDate'>) => {
  if (event.status) return event.status;

  const eventTime = new Date(event.eventDate).getTime();
  if (!Number.isFinite(eventTime)) return 'UPCOMING';

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);

  if (eventTime < startOfToday.getTime()) return 'COMPLETED';
  if (eventTime > endOfToday.getTime()) return 'UPCOMING';
  return 'ONGOING';
};

const withNormalizedStatus = (event: IEvent) => ({
  ...event,
  status: normalizeEventStatus(event),
});

router.get('/', async (req, res) => {
  try {
    const { tenantId, limit } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const limitNumber = limit ? Math.min(Number(limit), 50) : 20;
    const { Event } = await getTenantModels(String(tenantId));
    const events = (await Event.find({ tenantId })
      .sort({ eventDate: 1 })
      .limit(limitNumber)
      .lean()) as unknown as IEvent[];

    res.json(events.map(withNormalizedStatus));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    const { Event } = await getTenantModels(String(tenantId));
    const event = (await Event.findById(req.params.id).lean()) as unknown as IEvent | null;
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(withNormalizedStatus(event));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// POST: Create a new event (admin only)
router.post('/', async (req, res) => {
  try {
    const { tenantId, title, description, location, googleMapsUrl, mainImage, images, eventDate, capacity, registrationRequired, status, createdBy } = req.body;
    
    if (!tenantId || !title || !eventDate) {
      return res.status(400).json({ error: 'tenantId, title, and eventDate are required' });
    }

    const { Event } = await getTenantModels(String(tenantId));
    const newEvent = new Event({
      tenantId,
      title,
      description,
      location,
      googleMapsUrl,
      mainImage,
      images: images || [],
      eventDate,
      capacity,
      registrationRequired: registrationRequired || false,
      registeredCount: 0,
      status: status || 'UPCOMING',
      createdBy
    });

    const saved = await newEvent.save();
    // Log activity: Event created
    try {
      const actorId = (req as any).user?.id || createdBy || 'system';
      logActivity(String(tenantId), ActivityType.EVENT_CREATED, String(actorId), saved._id?.toString(), 'Event', `Created event: ${saved.title}`);
    } catch (e) {
      console.error('Failed to log event creation', e);
    }
    res.status(201).json(withNormalizedStatus(saved as unknown as IEvent));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT: Update an existing event (admin only)
router.put('/:id', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const { title, description, location, googleMapsUrl, mainImage, images, eventDate, capacity, registrationRequired, status } = req.body;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const { Event } = await getTenantModels(String(tenantId));
    const updates: Record<string, any> = {};
    
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (location !== undefined) updates.location = location;
    if (googleMapsUrl !== undefined) updates.googleMapsUrl = googleMapsUrl;
    if (mainImage !== undefined) updates.mainImage = mainImage;
    if (images !== undefined) updates.images = images;
    if (eventDate !== undefined) updates.eventDate = eventDate;
    if (capacity !== undefined) updates.capacity = capacity;
    if (registrationRequired !== undefined) updates.registrationRequired = registrationRequired;
    if (status !== undefined) updates.status = status;

    const updated = (await Event.findByIdAndUpdate(req.params.id, updates, { new: true }).lean()) as unknown as IEvent | null;
    
    if (!updated) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Log activity: Event updated
    try {
      const actorId = (req as any).user?.id || 'system';
      logActivity(String(tenantId), ActivityType.EVENT_UPDATED, String(actorId), updated._id?.toString(), 'Event', `Updated event: ${updated.title}`);
    } catch (e) {
      console.error('Failed to log event update', e);
    }

    res.json(withNormalizedStatus(updated as unknown as IEvent));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE: Remove an event (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    const { Event } = await getTenantModels(String(tenantId));
    const deleted = (await Event.findByIdAndDelete(req.params.id).lean()) as unknown as IEvent | null;
    
    if (!deleted) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Log activity: Event deleted
    try {
      const actorId = (req as any).user?.id || 'system';
      logActivity(String(tenantId), ActivityType.EVENT_UPDATED, String(actorId), deleted._id?.toString(), 'Event', `Deleted event: ${deleted.title}`);
    } catch (e) {
      console.error('Failed to log event deletion', e);
    }

    res.json({ message: 'Event deleted successfully', event: deleted });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// POST: Register user for an event
router.post('/:id/register', authenticate, async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware or provided in body
    const userId = req.user?.id || req.body.userId;
    const { tenantId } = req.query;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { Event } = await getTenantModels(String(tenantId));
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if already registered
    if (event.registeredUsers?.includes(userId)) {
      return res.status(400).json({ error: 'Already registered for this event' });
    }

    // Add to registered users and increment count
    const updated = await Event.findByIdAndUpdate(
      req.params.id,
      {
        $push: { registeredUsers: userId },
        $inc: { registeredCount: 1 }
      },
      { new: true }
    ).lean();

    // Log activity
    logActivity(
      String(tenantId),
      ActivityType.EVENT_REGISTERED,
      userId,
      req.params.id,
      'Event',
      `Registered for event: ${event.title}`
    );

    res.json({ message: 'Successfully registered for event', event: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register for event' });
  }
});

// POST: Unregister user from an event
router.post('/:id/unregister', authenticate, async (req, res) => {
  try {
    // @ts-ignore - set by auth middleware or provided in body
    const userId = req.user?.id || req.body.userId;
    const { tenantId } = req.query;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { Event } = await getTenantModels(String(tenantId));
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if registered
    if (!event.registeredUsers?.includes(userId)) {
      return res.status(400).json({ error: 'Not registered for this event' });
    }

    // Remove from registered users and decrement count
    const updated = await Event.findByIdAndUpdate(
      req.params.id,
      {
        $pull: { registeredUsers: userId },
        $inc: { registeredCount: -1 }
      },
      { new: true }
    ).lean();

    res.json({ message: 'Successfully unregistered from event', event: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to unregister from event' });
  }
});

export default router;
