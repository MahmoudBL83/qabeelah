import { Router, Request, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { PlatformSetting } from '../models';
import { uploadToBunny, validateFile } from '../services/fileUpload';

const router = Router();

// Configure multer to store files in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Validate MIME type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    } else {
      cb(null, true);
    }
  },
});

type TreeExtractionMember = {
  id?: string;
  firstName: string;
  lastName: string;
  birthYear?: number;
  deathYear?: number;
  isLiving?: boolean;
  parentId?: string;
  branchId?: string;
  bio?: string;
  imageSrc?: string;
};

const GEMINI_API_KEY_SETTING = 'gemini_api_key';
const GEMINI_MODEL_SETTING = 'gemini_model';

const readPlatformSetting = async (key: string) => {
  const setting = await PlatformSetting.findOne({ key }).lean();
  return setting?.value?.trim() || '';
};

const resolveGeminiConfig = async () => {
  const [savedKey, savedModel] = await Promise.all([
    readPlatformSetting(GEMINI_API_KEY_SETTING),
    readPlatformSetting(GEMINI_MODEL_SETTING)
  ]);

  return {
    apiKey: savedKey || process.env.GEMINI_API_KEY || '',
    model: savedModel || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    source: savedKey ? 'database' : process.env.GEMINI_API_KEY ? 'environment' : 'missing',
  };
};

const splitFullName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.includes(' ')) {
    return { firstName: trimmed, lastName: '' };
  }

  const lastSpace = trimmed.lastIndexOf(' ');
  return {
    firstName: trimmed.slice(0, lastSpace).trim(),
    lastName: trimmed.slice(lastSpace + 1).trim(),
  };
};

const parseNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'نعم'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'لا'].includes(normalized)) return false;
  }
  return undefined;
};

const normalizeTreeMember = (member: Record<string, unknown>, familyName: string): TreeExtractionMember | null => {
  const fullName = typeof member.fullName === 'string'
    ? member.fullName.trim()
    : typeof member.name === 'string'
      ? member.name.trim()
      : '';
  const rawFirstName = typeof member.firstName === 'string'
    ? member.firstName.trim()
    : typeof member.first_name === 'string'
      ? member.first_name.trim()
      : '';
  const rawLastName = typeof member.lastName === 'string'
    ? member.lastName.trim()
    : typeof member.last_name === 'string'
      ? member.last_name.trim()
      : '';
  const derivedName = fullName ? splitFullName(fullName) : { firstName: rawFirstName, lastName: rawLastName };
  const firstName = derivedName.firstName || rawFirstName;
  const lastName = derivedName.lastName || rawLastName || familyName;

  if (!firstName || !lastName) return null;

  return {
    id: typeof member.id === 'string' ? member.id.trim() : undefined,
    firstName,
    lastName,
    birthYear: parseNumber(member.birthYear),
    deathYear: parseNumber(member.deathYear),
    isLiving: parseBoolean(member.isLiving),
    parentId: typeof member.parentId === 'string' ? member.parentId.trim() : undefined,
    branchId: typeof member.branchId === 'string' ? member.branchId.trim() : undefined,
    bio: typeof member.bio === 'string' ? member.bio.trim() : undefined,
    imageSrc: typeof member.imageSrc === 'string' ? member.imageSrc.trim() : undefined,
  };
};

const stripCodeFences = (text: string) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

const parseGeminiJson = (text: string) => {
  const cleaned = stripCodeFences(text);

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as unknown;
    }

    if (firstBracket >= 0 && lastBracket > firstBracket) {
      return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1)) as unknown;
    }

    throw new Error('AI response did not contain valid JSON');
  }
};

const normalizeExtractionResult = (parsed: unknown, familyHint: string): { familyName?: string; members: TreeExtractionMember[]; rawText: string } => {
  const rawObject = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  const records = Array.isArray(parsed)
    ? parsed
    : Array.isArray(rawObject?.members)
      ? rawObject.members
      : Array.isArray(rawObject?.people)
        ? rawObject.people
        : [];

  const familyName = typeof rawObject?.familyName === 'string'
    ? rawObject.familyName.trim()
    : typeof rawObject?.name === 'string'
      ? rawObject.name.trim()
      : familyHint.trim();

  return {
    familyName: familyName || undefined,
    members: records
      .filter((record): record is Record<string, unknown> => Boolean(record && typeof record === 'object'))
      .map((record) => normalizeTreeMember(record, familyName || familyHint))
      .filter((member): member is TreeExtractionMember => Boolean(member)),
    rawText: JSON.stringify(parsed, null, 2),
  };
};

const extractTreeMembersFromImage = async (buffer: Buffer, mimetype: string, familyHint: string) => {
  const geminiConfig = await resolveGeminiConfig();
  if (!geminiConfig.apiKey) {
    throw new Error('Gemini API key is not configured in the super-admin dashboard or environment');
  }

  const prompt = `
You are extracting a family tree from an image.
Return only valid JSON and nothing else.

Required output shape:
{
  "familyName": string | null,
  "members": [
    {
      "id": string,
      "fullName": string,
      "firstName": string,
      "lastName": string,
      "birthYear": number | null,
      "deathYear": number | null,
      "isLiving": boolean | null,
      "parentId": string | null,
      "branchId": string | null,
      "bio": string | null
    }
  ],
  "notes": string[]
}

Rules:
- Preserve Arabic names exactly as written when visible.
- Infer parent-child relationships from the tree structure.
- Use stable ids such as root, child-1, child-2, or a visible label if present.
- If a value is unknown, use null.
- If the image is not a family tree, return { "familyName": null, "members": [], "notes": ["Not a family tree"] }.
- Keep the JSON compact and valid.
`.trim();

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiConfig.model)}:generateContent?key=${encodeURIComponent(geminiConfig.apiKey)}`,
    {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimetype,
                data: buffer.toString('base64'),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    },
    {
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  const rawText = response.data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('')
    .trim();

  if (!rawText) {
    throw new Error('AI response was empty');
  }

  const parsed = parseGeminiJson(rawText);
  return normalizeExtractionResult(parsed, familyHint);
};

/**
 * Upload a file to Bunny.net CDN
 * POST /api/upload
 * Body: multipart/form-data with 'file' field
 */
router.post('/', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, mimetype, size, buffer } = req.file;

    // Validate file
    const validation = validateFile(mimetype, size);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error || 'File validation failed' });
    }

    // Upload to Bunny.net
    const result = await uploadToBunny(buffer, originalname, mimetype);

    res.json({
      success: true,
      url: result.url,
      fileName: result.fileName,
      size: result.size,
    });
  } catch (error) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload file';
    res.status(500).json({ error: message });
  }
});

/**
 * Extract members from a family tree image using Gemini OCR/Vision.
 * POST /api/upload/extract-tree
 * Body: multipart/form-data with 'file' field and optional familyName
 */
router.post('/extract-tree', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, mimetype, size, buffer } = req.file;
    const validation = validateFile(mimetype, size);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error || 'File validation failed' });
    }

    const familyHint = typeof req.body?.familyName === 'string' && req.body.familyName.trim()
      ? req.body.familyName.trim()
      : originalname.replace(/\.[^.]+$/, '').trim();

    const result = await extractTreeMembersFromImage(buffer, mimetype, familyHint);

    res.json({
      success: true,
      familyName: result.familyName || familyHint || null,
      members: result.members,
      rawText: result.rawText,
    });
  } catch (error) {
    console.error('Tree extraction error:', error);
    const message = error instanceof Error ? error.message : 'Failed to extract tree';
    res.status(500).json({ error: message });
  }
});

/**
 * Health check for upload service
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'file-upload' });
});

export default router;
