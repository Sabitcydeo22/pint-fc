// Request validation (docs/design/rules.md §5): one STRICT schema per request, shared with tests.
// Unknown fields (for example a `player_id` on an RSVP) are errors, not ignored.
import { z } from 'zod';
import { AppError } from './errors';

export const signInSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export const rsvpSchema = z.strictObject({
  answer: z.enum(['going', 'maybe', 'not_going']),
  reason: z.string().max(140).optional(),
});

export const settingsSchema = z
  .strictObject({
    public_opt_in: z.boolean().optional(),
    show_photo: z.boolean().optional(),
    show_nationality: z.boolean().optional(),
    show_stats: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'at least one setting is required' });

/** Any 8-4-4-4-12 hex id (the seed uses fixed ids that are not RFC version-4 ids). */
export const uuidSchema = z.guid();

/** Parses or throws AppError VALIDATION (400). The message names fields, never the submitted values. */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const message = result.error.issues
    .map((i) => `${i.path.length ? i.path.join('.') : 'body'}: ${i.message}`)
    .join('; ');
  throw new AppError('VALIDATION', message);
}
