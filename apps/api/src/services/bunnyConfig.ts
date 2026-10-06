// Read deployment credentials only from the server environment.
const normalizeCdnHostname = (hostname: string) => hostname.trim().replace(/\/+$/g, '');

export const resolveBunnyConfig = async () => ({
  apiKey: (process.env.BUNNY_API_KEY || '').trim(),
  storageZone: (process.env.BUNNY_STORAGE_ZONE || '').trim(),
  cdnHostname: normalizeCdnHostname(process.env.BUNNY_CDN_HOSTNAME || ''),
  tokenKey: (process.env.BUNNY_CDN_TOKEN_KEY || '').trim(),
});
