import webpush from 'web-push';

type WebPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || '';
const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
const subject = process.env.WEB_PUSH_SUBJECT || 'mailto:support@qabila.app';

let configured = false;

const configureWebPush = () => {
  if (configured) return;
  if (!publicKey || !privateKey) return;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
};

export const getWebPushPublicKey = () => publicKey || null;

export const sendWebPush = async (subscription: WebPushSubscription, payload: Record<string, any>) => {
  configureWebPush();
  if (!publicKey || !privateKey) {
    return { skipped: true };
  }

  return webpush.sendNotification(subscription as any, JSON.stringify(payload));
};
