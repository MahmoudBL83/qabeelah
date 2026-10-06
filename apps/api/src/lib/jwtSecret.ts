export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === 'test') return 'test-secret';
  if (!secret) throw new Error('JWT_SECRET must be configured before starting the API');
  return secret;
};
