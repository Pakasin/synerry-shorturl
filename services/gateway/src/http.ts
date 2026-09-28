import type { Context } from 'hono';
import type { ZodError } from 'zod';
import { apiError } from '@synerry/shared';

export const readJson = (c: Context): Promise<unknown> => c.req.json().catch(() => ({}));

export function toFieldErrors(error: ZodError) {
  return error.issues.map((issue) => ({ field: String(issue.path[0] ?? '_'), message: issue.message }));
}

export const invalid = (c: Context, error: ZodError, message = 'Invalid input') =>
  c.json(apiError('validation_error', message, toFieldErrors(error)), 400);

export const fieldError = (c: Context, field: string, message: string) =>
  c.json(apiError('validation_error', 'Invalid input', [{ field, message }]), 400);

export const notFound = (c: Context, message = 'Not found') => c.json(apiError('not_found', message), 404);

export function download(c: Context, body: string | Uint8Array<ArrayBuffer>, contentType: string, filename: string) {
  c.header('Content-Type', contentType);
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('Cache-Control', 'no-store');
  return typeof body === 'string' ? c.body(body) : c.body(body);
}
