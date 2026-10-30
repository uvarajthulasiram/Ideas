-- Initial schema. See PLAN.md, "Data (D1)".
-- Stay dates are TEXT 'YYYY-MM-DD' in the property's timezone; end dates are exclusive.
-- Timestamps are INTEGER unix seconds (UTC). Money is INTEGER minor units (cents).

-- One row per iCal import or PriceLabs fetch.
CREATE TABLE sync_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('ical_import', 'price_fetch')),
  property_id TEXT    NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  ok          INTEGER CHECK (ok IN (0, 1)),       -- NULL while running
  error       TEXT,
  counts      TEXT                                -- JSON, e.g. {"added":2,"removed":1,"kept":9}
);
CREATE INDEX sync_runs_recent ON sync_runs (property_id, kind, started_at DESC);

-- Nights blocked by an imported calendar (Airbnb, VRBO, ...). Never re-exported.
CREATE TABLE blocked_dates (
  property_id   TEXT    NOT NULL,
  channel       TEXT    NOT NULL,
  event_uid     TEXT    NOT NULL,
  start_date    TEXT    NOT NULL,
  end_date      TEXT    NOT NULL,
  last_seen_run INTEGER NOT NULL REFERENCES sync_runs (id),
  PRIMARY KEY (property_id, channel, event_uid),
  CHECK (start_date < end_date)
);
CREATE INDEX blocked_dates_range ON blocked_dates (property_id, start_date, end_date);

-- Direct bookings. A 'hold' lasts as long as its Stripe Checkout Session (30 minutes).
CREATE TABLE bookings (
  id                       TEXT    PRIMARY KEY,
  view_token               TEXT    NOT NULL,      -- for GET /api/booking/<id>?t=<token>
  property_id              TEXT    NOT NULL,
  check_in                 TEXT    NOT NULL,
  check_out                TEXT    NOT NULL,
  guests                   INTEGER NOT NULL CHECK (guests >= 1),
  status                   TEXT    NOT NULL CHECK (status IN ('hold', 'confirmed', 'cancelled', 'expired')),
  hold_expires_at          INTEGER,
  guest_name               TEXT    NOT NULL,
  guest_email              TEXT    NOT NULL,
  guest_phone              TEXT,
  quote                    TEXT    NOT NULL,      -- JSON snapshot of the quote, minor units
  currency                 TEXT    NOT NULL,
  amount_paid              INTEGER NOT NULL DEFAULT 0,
  balance_due_date         TEXT,                  -- NULL when paid in full at booking
  stripe_session_id        TEXT    UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_customer_id       TEXT,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  CHECK (check_in < check_out),
  CHECK (status <> 'hold' OR hold_expires_at IS NOT NULL)
);
CREATE INDEX bookings_active ON bookings (property_id, status, check_in, check_out);
CREATE INDEX bookings_balance_due ON bookings (status, balance_due_date);

-- PriceLabs copy. A night without a row here can't be booked.
CREATE TABLE nightly_rates (
  property_id TEXT    NOT NULL,
  date        TEXT    NOT NULL,
  price       INTEGER NOT NULL CHECK (price >= 0),
  min_stay    INTEGER CHECK (min_stay >= 1),
  fetched_at  INTEGER NOT NULL,
  PRIMARY KEY (property_id, date)
);

-- Dates the host blocks directly (optional admin).
CREATE TABLE manual_blocks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id TEXT    NOT NULL,
  start_date  TEXT    NOT NULL,
  end_date    TEXT    NOT NULL,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  CHECK (start_date < end_date)
);
CREATE INDEX manual_blocks_range ON manual_blocks (property_id, start_date, end_date);
