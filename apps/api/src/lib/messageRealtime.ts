import type { Response } from 'express';

export type MessageRealtimeEvent =
  | { type: 'message.created'; payload: unknown }
  | { type: 'message.updated'; payload: unknown };

type Subscriber = {
  tenantId: string;
  scope: 'DIRECT' | 'BRANCH' | 'ANNOUNCEMENT';
  userId: string;
  targetUserId?: string;
  branchId?: string;
  response: Response;
};

const subscribers = new Set<Subscriber>();

const writeEvent = (response: Response, event: MessageRealtimeEvent) => {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event.payload)}\n\n`);
};

export const addMessageSubscriber = (subscriber: Omit<Subscriber, 'response'>, response: Response) => {
  const entry: Subscriber = { ...subscriber, response };
  subscribers.add(entry);

  response.write('event: ready\n');
  response.write('data: {}\n\n');

  response.on('close', () => {
    subscribers.delete(entry);
  });
};

export const broadcastMessageEvent = (event: MessageRealtimeEvent) => {
  for (const subscriber of subscribers) {
    const payload = event.payload as any;
    const tenantId = String(payload.tenantId || '');
    const scope = String(payload.scope || '').toUpperCase() as Subscriber['scope'];
    const senderId = String(payload.senderId || '');
    const recipientUserId = payload.recipientUserId ? String(payload.recipientUserId) : undefined;
    const branchId = payload.branchId ? String(payload.branchId) : undefined;

    if (subscriber.tenantId !== tenantId || subscriber.scope !== scope) continue;

    if (scope === 'DIRECT') {
      const targetUserId = subscriber.targetUserId;
      if (!targetUserId) continue;

      const isConversationMatch =
        (senderId === subscriber.userId && recipientUserId === targetUserId) ||
        (senderId === targetUserId && recipientUserId === subscriber.userId);

      if (!isConversationMatch) continue;
    }

    if (scope === 'BRANCH') {
      const subscriberBranchId = subscriber.branchId || 'الفرع الرئيسي';
      const payloadBranchId = branchId || 'الفرع الرئيسي';
      if (subscriberBranchId !== payloadBranchId) continue;
    }

    if (scope === 'ANNOUNCEMENT') {
      if (branchId && subscriber.branchId && branchId !== subscriber.branchId) continue;
    }

    writeEvent(subscriber.response, event);
  }
};
