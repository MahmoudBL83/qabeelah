import { z } from 'zod';

// Email validation
const emailSchema = z.string().email('Invalid email address').trim();

// Password validation - at least 8 chars, 1 uppercase, 1 number
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/\d/, 'Password must contain at least one number');

// Name validation - 2-100 chars, no HTML/script tags
const nameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be at most 100 characters')
  .refine(
    (val) => !/<[^>]*>/g.test(val),
    'Name cannot contain HTML tags'
  );

// Tenant slug validation - alphanumeric and hyphens only
const tenantSlugSchema = z
  .string()
  .min(3, 'Tenant slug must be at least 3 characters')
  .max(50, 'Tenant slug must be at most 50 characters')
  .regex(/^[a-z0-9-]+$/, 'Tenant slug can only contain lowercase letters, numbers, and hyphens');

// Year validation
const yearSchema = z
  .number()
  .int()
  .min(1000, 'Year must be valid')
  .max(new Date().getFullYear() + 10, 'Year cannot be in the future');

// Bio validation - max 1000 chars
const bioSchema = z
  .string()
  .max(1000, 'Bio must be at most 1000 characters')
  .optional();

// URL validation for image src
const urlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .url('Invalid URL')
    .startsWith('https://', 'Image URL must use HTTPS')
    .optional()
);

// MongoDB ObjectId validation
const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ID format');

// ============== AUTH SCHEMAS ==============

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  tenantSlug: z.string().optional(),
});

export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  tenantSlug: tenantSlugSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export const emailPreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  eventReminders: z.boolean().optional(),
  announcements: z.boolean().optional(),
}).refine(
  (value) =>
    value.emailNotifications !== undefined ||
    value.eventReminders !== undefined ||
    value.announcements !== undefined,
  'At least one preference must be provided'
);

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  phone: z
    .string()
    .max(20, 'Phone must be at most 20 characters')
    .regex(/^[\d+\-\s()]*$/, 'Invalid phone number format')
    .optional(),
  location: z
    .string()
    .max(100, 'Location must be at most 100 characters')
    .optional(),
  bio: bioSchema,
  avatarUrl: urlSchema,
});

// ============== TENANT SCHEMAS ==============

export const createTenantSchema = z.object({
  arabicName: nameSchema,
  subdomain: tenantSlugSchema,
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional(),
});

export const updateTenantSchema = z.object({
  arabicName: nameSchema.optional(),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional(),
});

// ============== PERSON SCHEMAS ==============

export const createPersonSchema = z.object({
  tenantId: objectIdSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  birthYear: yearSchema.nullable().optional(),
  deathYear: yearSchema.nullable().optional(),
  isLiving: z.boolean().optional(),
  bio: bioSchema,
  imageSrc: urlSchema,
  parentId: objectIdSchema.nullable().optional(),
  branchId: z.string().max(100).optional(),
  spouseIds: z.array(objectIdSchema).optional(),
  partnerships: z.array(z.object({
    spouseId: objectIdSchema,
    children: z.array(objectIdSchema).optional(),
  })).optional(),
});

export const updatePersonSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  birthYear: yearSchema.nullable().optional(),
  deathYear: yearSchema.nullable().optional(),
  isLiving: z.boolean().optional(),
  bio: bioSchema,
  imageSrc: urlSchema,
  parentId: objectIdSchema.nullable().optional(),
  branchId: z.string().max(100).optional(),
  spouseIds: z.array(objectIdSchema).optional(),
  partnerships: z.array(z.object({
    spouseId: objectIdSchema,
    children: z.array(objectIdSchema).optional(),
  })).optional(),
});

export const searchPersonSchema = z.object({
  query: z.string().max(100).optional(),
  branch: z.string().max(100).optional(),
  birthFrom: z.number().int().optional(),
  birthTo: z.number().int().optional(),
  livingOnly: z.enum(['true', 'false']).optional(),
  hasBioOnly: z.enum(['true', 'false']).optional(),
});

// ============== JOIN REQUEST SCHEMAS ==============

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

export const createJoinRequestSchema = z.object({
  tenantId: objectIdSchema,
  fullName: nameSchema,
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be at most 100 characters'),
  phone: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .min(5, 'Phone must be at least 5 characters')
      .max(20, 'Phone must be at most 20 characters')
      .regex(/^[\d+\-\s()]*$/, 'Invalid phone number format')
      .optional()
  ),
  relationship: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .min(2, 'Relationship must be at least 2 characters')
      .max(100, 'Relationship must be at most 100 characters')
      .optional()
  ),
  message: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .max(500, 'Message must be at most 500 characters')
      .optional()
  ),
});

export const decideJoinRequestSchema = z.object({
  decision: z
    .enum(['approve', 'reject'])
    .optional(),
  parentId: objectIdSchema.optional(),
  addToTree: z.boolean().optional(),
});

// ============== EVENT SCHEMAS ==============

export const createEventSchema = z.object({
  tenantId: objectIdSchema,
  title: z
    .string()
    .min(3, 'Event title must be at least 3 characters')
    .max(200, 'Event title must be at most 200 characters'),
  description: z
    .string()
    .max(1000, 'Description must be at most 1000 characters')
    .optional(),
  eventDate: z
    .string()
    .datetime('Invalid date format')
    .optional(),
  location: z
    .string()
    .max(200, 'Location must be at most 200 characters')
    .optional(),
  googleMapsUrl: z
    .string()
    .url('Invalid URL')
    .optional(),
  mainImage: z
    .string()
    .url('Invalid image URL')
    .optional(),
  images: z
    .array(z.string().url('Invalid image URL'))
    .optional(),
  capacity: z
    .number()
    .int('Capacity must be an integer')
    .min(1, 'Capacity must be at least 1')
    .optional(),
  registrationRequired: z
    .boolean()
    .optional(),
});

export const updateEventSchema = z.object({
  title: z
    .string()
    .min(3, 'Event title must be at least 3 characters')
    .max(200, 'Event title must be at most 200 characters')
    .optional(),
  description: z
    .string()
    .max(1000, 'Description must be at most 1000 characters')
    .optional(),
  eventDate: z
    .string()
    .datetime('Invalid date format')
    .optional(),
  location: z
    .string()
    .max(200, 'Location must be at most 200 characters')
    .optional(),
  googleMapsUrl: z
    .string()
    .url('Invalid URL')
    .optional(),
  mainImage: z
    .string()
    .url('Invalid image URL')
    .optional(),
  images: z
    .array(z.string().url('Invalid image URL'))
    .optional(),
  capacity: z
    .number()
    .int('Capacity must be an integer')
    .min(1, 'Capacity must be at least 1')
    .optional(),
  registrationRequired: z
    .boolean()
    .optional(),
});

// ============== SHARED QUERY PARAM SCHEMAS ==============

export const paginationSchema = z.object({
  page: z
    .number()
    .int()
    .min(1, 'Page must be at least 1')
    .optional()
    .default(1),
  limit: z
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(20),
});

export const tenantIdSchema = z.object({
  tenantId: objectIdSchema,
});

export const idParamSchema = z.object({
  id: objectIdSchema,
});
