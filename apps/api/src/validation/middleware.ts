import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export type ValidationType = 'body' | 'params' | 'query';

/**
 * Middleware factory that validates request data against a Zod schema
 * @param schema - Zod schema to validate against
 * @param type - Type of request data to validate (body, params, or query)
 */
export const validate = (schema: ZodSchema, type: ValidationType = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataToValidate = type === 'body' ? req.body : type === 'params' ? req.params : req.query;
      
      console.log(`[validate] Validating ${type}:`, JSON.stringify(dataToValidate));
      
      const validatedData = schema.parse(dataToValidate);
      
      console.log(`[validate] Validation passed for ${type}`);
      
      // Store validated data back in the request
      if (type === 'body') {
        req.body = validatedData;
      } else if (type === 'params') {
        req.params = validatedData as any;
      } else if (type === 'query') {
        req.query = validatedData as any;
      }
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        console.error(`[validate] Validation errors for ${type}:`, error.issues);
        
        const formattedErrors = error.issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        console.error(`[validate] Formatted errors:`, JSON.stringify(formattedErrors, null, 2));
        
        return res.status(400).json({
          error: 'Validation error',
          details: formattedErrors,
        });
      }
      
      console.error(`[validate] Unexpected error during validation:`, error);
      return res.status(500).json({ error: 'Internal server error during validation' });
    }
  };
};

/**
 * Sanitize string input to prevent XSS attacks
 */
export const sanitizeString = (input: string): string => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Recursively sanitize all string values in an object
 */
export const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (obj !== null && typeof obj === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
};

/**
 * Middleware to sanitize all request data
 */
export const sanitize = (req: Request, res: Response, next: NextFunction) => {
  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  // Note: params are from URL and already encoded by Express
  next();
};
