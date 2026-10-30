-- Phase 5: checkout details and idempotent notification tracking.

ALTER TABLE bookings ADD COLUMN guest_note TEXT;
-- Set once each email is sent, so a webhook retry sends only what is missing.
ALTER TABLE bookings ADD COLUMN guest_emailed_at INTEGER;
ALTER TABLE bookings ADD COLUMN host_alerted_at INTEGER;
-- Why a booking ended (e.g. 'released by guest', 'paid after hold expired; dates taken').
ALTER TABLE bookings ADD COLUMN status_note TEXT;
