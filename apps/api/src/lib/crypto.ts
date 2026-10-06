import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

const getKey = () => {
  const raw = process.env.DB_URI_ENCRYPTION_KEY || '';
  if (!raw) throw new Error('DB_URI_ENCRYPTION_KEY is not set');
  // Expect base64 encoded 32-byte key
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DB_URI_ENCRYPTION_KEY must be base64 of 32 bytes');
  return key;
};

export const encryptString = (plaintext: string) => {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

export const decryptString = (payload: string) => {
  const key = getKey();
  const parts = String(payload).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};

export default { encryptString, decryptString };
