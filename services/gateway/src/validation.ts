import { z } from 'zod';

export const idParamSchema = z.coerce.number().int().positive();

export const paginationSchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const offsetOf = ({ page, pageSize }: { page: number; pageSize: number }) => (page - 1) * pageSize;

export const containsPattern = (term: string) => `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
