import axios from 'axios';
import { Readable } from 'stream';
import { resolveBunnyConfig } from './bunnyConfig';

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed image types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export interface UploadResult {
  url: string;
  fileName: string;
  size: number;
}

/**
 * Validate file before upload
 */
export const validateFile = (
  mimeType: string,
  size: number
): { valid: boolean; error?: string } => {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }

  if (size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
};

/**
 * Generate a unique filename with timestamp
 */
const generateFileName = (originalName: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = originalName.split('.').pop() || 'jpg';
  return `${timestamp}-${random}.${ext}`;
};

/**
 * Upload file to Bunny.net CDN
 */
export const uploadToBunny = async (
  fileBuffer: Buffer,
  originalFileName: string,
  mimeType: string
): Promise<UploadResult> => {
  // Validate file
  const validation = validateFile(mimeType, fileBuffer.length);
  if (!validation.valid) {
    throw new Error(validation.error || 'File validation failed');
  }

  const bunnyConfig = await resolveBunnyConfig();

  if (!bunnyConfig.apiKey) {
    throw new Error('Bunny.net API key not configured');
  }

  // Generate unique filename
  const fileName = generateFileName(originalFileName);
  // Get the storage zone name from config, fallback to 'qabila' if not specified
  const storageZoneName = bunnyConfig.storageZone || 'qabila';
  
  // Bunny.net requires the storage zone name in the path
  const uploadPath = `/${storageZoneName}/${fileName}`;
  
  // Always use the primary storage endpoint for Europe
  const bunnyStorageApi = 'https://storage.bunnycdn.com';
  const bunnyCdnHostname = bunnyConfig.cdnHostname || `https://${process.env.BUNNY_PULL_ZONE || 'qabila-cdn'}.b-cdn.net`;

  try {
    // Upload to Bunny.net storage
    const response = await axios.put(
      `${bunnyStorageApi}${uploadPath}`,
      fileBuffer,
      {
        headers: {
          'AccessKey': bunnyConfig.apiKey,
          'Content-Type': mimeType,
        },
        timeout: 30000, // 30 second timeout
      }
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Bunny upload failed with status ${response.status}`);
    }

    // Return CDN URL
    const cdnUrl = `${bunnyCdnHostname}${uploadPath}`;

    return {
      url: cdnUrl,
      fileName,
      size: fileBuffer.length,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const code = error.code ? ` ${error.code}` : '';
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const responseMessage = typeof error.response?.data === 'string'
        ? error.response.data
        : typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : '';
      const details = [
        status ? `status ${status}` : '',
        statusText || '',
        code.trim(),
        error.message || '',
        responseMessage,
      ].filter(Boolean).join(' | ');
      throw new Error(`Failed to upload to Bunny.net${details ? `: ${details}` : ''}`);
    }
    throw error;
  }
};

/**
 * Delete file from Bunny.net CDN
 */
export const deleteFromBunny = async (fileName: string): Promise<void> => {
  const bunnyConfig = await resolveBunnyConfig();

  if (!bunnyConfig.apiKey) {
    console.error('Bunny.net API key not configured');
    return;
  }

  const storageZoneName = bunnyConfig.storageZone || 'qabila';
  
  const uploadPath = `/${storageZoneName}/${fileName}`;
  const bunnyStorageApi = 'https://storage.bunnycdn.com';

  try {
    await axios.delete(`${bunnyStorageApi}${uploadPath}`, {
      headers: {
        'AccessKey': bunnyConfig.apiKey,
      },
      timeout: 10000,
    });
  } catch (error) {
    console.error('Failed to delete from Bunny.net:', error);
    // Don't throw - deletion failures shouldn't break the app
  }
};
