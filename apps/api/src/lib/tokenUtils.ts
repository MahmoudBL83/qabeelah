import crypto from 'crypto';

/**
 * Generate a secure random token for email verification, password reset, etc.
 */
export const generateToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate a human-readable verification code (6 digits)
 */
export const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Hash a token for storage in database
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Verify a token matches its hash
 */
export const verifyToken = (token: string, hash: string): boolean => {
  return hashToken(token) === hash;
};

/**
 * Generate a Unix timestamp for when token expires (in seconds)
 */
export const getTokenExpiry = (expiresInSeconds: number = 3600): number => {
  return Math.floor(Date.now() / 1000) + expiresInSeconds;
};

/**
 * Check if a token has expired
 */
export const isTokenExpired = (expiryTimestamp: number): boolean => {
  return Math.floor(Date.now() / 1000) > expiryTimestamp;
};
