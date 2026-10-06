import type { Response } from 'express';

export type NotificationRealtimeEvent =
  | { type: 'notification.created'; payload: unknown }
  | { type: 'notification.read'; payload: unknown };

type Subscriber = {
  tenantId: string;
  userId: string;
  response: Response;
};

const subscribers = new Set<Subscriber>();

const writeEvent = (response: Response, event: NotificationRealtimeEvent) => {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event.payload)}\n\n`);
};

export const addNotificationSubscriber = (subscriber: Omit<Subscriber, 'response'>, response: Response) => {
  const entry: Subscriber = { ...subscriber, response };
  subscribers.add(entry);

  response.write('event: ready\n');
  response.write('data: {}\n\n');

  response.on('close', () => {
    subscribers.delete(entry);
  });
};

export const broadcastNotificationEvent = (event: NotificationRealtimeEvent) => {
  const payload = event.payload as any;
  const tenantId = String(payload.tenantId || '');
  const userId = String(payload.userId || '');

  for (const subscriber of subscribers) {
    if (subscriber.tenantId !== tenantId) continue;
    if (subscriber.userId !== userId) continue;
    writeEvent(subscriber.response, event);
  }
};
