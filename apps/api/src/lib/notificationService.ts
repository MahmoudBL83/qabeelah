import Notification from '../models/Notification';
import User from '../models/User';
import { broadcastNotificationEvent } from './notificationRealtime';
import { sendExpoPush } from './expoPush';
import { sendWebPush } from './webPush';

export type CreateNotificationInput = {
  userId: string;
  tenantId?: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, any>;
  push?: boolean;
  url?: string;
  messageId?: string;
};

export const createNotification = async (input: CreateNotificationInput) => {
  const notificationData = {
    ...(input.data || {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.messageId ? { messageId: input.messageId } : {}),
  };

  const created = await Notification.create({
    userId: input.userId,
    tenantId: input.tenantId,
    type: input.type,
    title: input.title,
    body: input.body,
    data: notificationData,
    read: false,
  });

  broadcastNotificationEvent({
    type: 'notification.created',
    payload: created.toObject(),
  });

  if (input.push) {
    const user = await User.findById(input.userId).lean();
    const pushTokens = (user as any)?.pushTokens || [];
    const webPushSubscriptions = (user as any)?.webPushSubscriptions || [];
    const destinationUrl = input.url || (input.data as any)?.url || '/messages';

    await Promise.allSettled(
      pushTokens
        .filter((entry: any) => entry?.token)
        .map((entry: any) =>
          sendExpoPush(entry.token, input.title, input.body || '', {
            ...notificationData,
            url: destinationUrl,
            messageId: input.messageId,
          })
        )
    );

    await Promise.allSettled(
      webPushSubscriptions
        .filter((entry: any) => entry?.endpoint && entry?.keys?.p256dh && entry?.keys?.auth)
        .map((entry: any) =>
          sendWebPush(entry, {
            title: input.title,
            body: input.body || '',
            data: {
              ...(notificationData || {}),
              url: destinationUrl,
            },
          })
        )
    );
  }

  return created;
};
