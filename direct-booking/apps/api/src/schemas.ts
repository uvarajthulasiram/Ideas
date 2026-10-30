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

export const CheckoutBody = QuoteBody.extend({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.email("Enter a valid email").max(254),
  phone: z.string().trim().min(7, "Enter a phone number").max(32).regex(/^[+\d\s().-]+$/, "Enter a valid phone number"),
  note: z.string().trim().max(1000).default(""),
  agreed: z.literal(true, "Please agree to the house rules, cancellation policy and booking terms"),
  turnstileToken: z.string().max(2048),
  expectedTotal: z.number().int().nonnegative(),
});

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, "invalid_request", "Some details are missing or invalid.", z.flattenError(result.error as z.ZodError<unknown>).fieldErrors);
  }
  return result.data;
}
