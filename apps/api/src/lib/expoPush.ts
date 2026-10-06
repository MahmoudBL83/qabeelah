export const sendExpoPush = async (expoPushToken: string, title: string, body: string, data?: any) => {
  if (!expoPushToken) throw new Error('Missing token');

  const message = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
    data: data || {}
  };

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Expo push failed: ${res.status} ${text}`);
  }

  return res.json();
};
