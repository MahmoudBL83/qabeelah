import Tenant from '../models/Tenant';
import User from '../models/User';
import { getTenantModels } from './tenantDb';
import { sendEventReminderEmail } from './mailer';

const EVENT_REMINDER_INTERVAL_MS = Number(process.env.EVENT_REMINDER_INTERVAL_MS || 60 * 60 * 1000);
const EVENT_REMINDER_WINDOW_HOURS = Number(process.env.EVENT_REMINDER_WINDOW_HOURS || 24);
const APP_URL = process.env.APP_URL || 'https://qabeelah.app';

let schedulerStarted = false;

type ReminderCycleResult = {
  tenantsProcessed: number;
  eventsProcessed: number;
  emailsAttempted: number;
};

const formatEventDate = (date: Date) =>
  new Intl.DateTimeFormat('ar', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);

const processReminderCycle = async (tenantId?: string): Promise<ReminderCycleResult> => {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + EVENT_REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

  const result: ReminderCycleResult = {
    tenantsProcessed: 0,
    eventsProcessed: 0,
    emailsAttempted: 0,
  };

  const tenantQuery: Record<string, unknown> = { isActive: true };
  if (tenantId) {
    tenantQuery._id = tenantId;
  }

  const tenants = await Tenant.find(tenantQuery).select('_id name').lean();
  result.tenantsProcessed = tenants.length;

  for (const tenant of tenants) {
    try {
      const { Event } = await getTenantModels(String(tenant._id));
      const events = await Event.find({
        tenantId: tenant._id,
        status: { $nin: ['CANCELLED', 'COMPLETED'] },
        eventDate: { $gte: now, $lte: windowEnd },
        $or: [{ reminderSentAt: { $exists: false } }, { reminderSentAt: null }],
      }).lean();

      for (const event of events) {
        result.eventsProcessed += 1;
        const attendeeIds = Array.isArray((event as any).registeredUsers)
          ? ((event as any).registeredUsers as string[])
          : [];

        if (attendeeIds.length === 0) {
          await Event.updateOne({ _id: (event as any)._id }, { $set: { reminderSentAt: new Date() } });
          continue;
        }

        const recipients = await User.find({
          _id: { $in: attendeeIds },
          tenantId: tenant._id,
        })
          .select('email')
          .lean();

        for (const recipient of recipients) {
          try {
            result.emailsAttempted += 1;
            await sendEventReminderEmail(
              (recipient as any).email,
              String((event as any).title || 'حدث عائلي'),
              formatEventDate(new Date((event as any).eventDate)),
              String((event as any).location || 'سيتم تحديد المكان'),
              String((event as any).description || ''),
              String(tenant._id),
              String((tenant as any).name || 'قبيلة'),
              APP_URL,
              String((event as any)._id)
            );
          } catch (error) {
            console.error('[REMINDERS] Failed to send reminder email', error);
          }
        }

        await Event.updateOne({ _id: (event as any)._id }, { $set: { reminderSentAt: new Date() } });
      }
    } catch (error) {
      console.error('[REMINDERS] Failed processing tenant reminders', {
        tenantId: String(tenant._id),
        error,
      });
    }
  }

  return result;
};

export const runEventReminderCycleOnce = async (tenantId?: string) => processReminderCycle(tenantId);

export const startEventReminderScheduler = () => {
  if (schedulerStarted) return;

  const schedulerEnabled = process.env.ENABLE_EVENT_REMINDERS !== 'false';
  if (!schedulerEnabled) {
    console.log('[REMINDERS] Scheduler disabled by ENABLE_EVENT_REMINDERS=false');
    return;
  }

  schedulerStarted = true;
  console.log(
    `[REMINDERS] Scheduler started. Interval=${EVENT_REMINDER_INTERVAL_MS}ms, Window=${EVENT_REMINDER_WINDOW_HOURS}h`
  );

  processReminderCycle().catch((error) => {
    console.error('[REMINDERS] Initial reminder cycle failed', error);
  });

  setInterval(() => {
    processReminderCycle().catch((error) => {
      console.error('[REMINDERS] Reminder cycle failed', error);
    });
  }, EVENT_REMINDER_INTERVAL_MS);
};
