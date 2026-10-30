-- Phase 6: balance charges and cancellations.

-- NULL until the balance is due; then 'pending' (being charged), 'paid' or 'failed' (guest sent a payment link).
ALTER TABLE bookings ADD COLUMN balance_status TEXT CHECK (balance_status IN ('pending', 'paid', 'failed'));
ALTER TABLE bookings ADD COLUMN balance_attempted_at INTEGER;
ALTER TABLE bookings ADD COLUMN balance_payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN balance_session_id TEXT;
ALTER TABLE bookings ADD COLUMN balance_error TEXT;

ALTER TABLE bookings ADD COLUMN cancelled_at INTEGER;
ALTER TABLE bookings ADD COLUMN refunded_amount INTEGER NOT NULL DEFAULT 0;
