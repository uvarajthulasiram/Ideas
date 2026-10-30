// Request bodies, validated before anything touches D1 or Stripe.

import { z } from "zod";
import { HttpError } from "./http";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const QuoteBody = z.object({
  property: z.string().min(1).max(64),
  checkIn: date,
  checkOut: date,
  guests: z.number().int().min(1).max(50),
});

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, "invalid_request", "Some details are missing or invalid.", z.flattenError(result.error as z.ZodError<unknown>).fieldErrors);
  }
  return result.data;
}
