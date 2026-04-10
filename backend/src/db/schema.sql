-- ============================================================================
-- Spa CRM Database Schema
-- Based on DESIGN.md v1.1
-- 7 tables: admins, invite_codes, stores, store_sessions, customers,
--           intake_forms, visits
-- ============================================================================

-- admins
CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS admins_updated_at AFTER UPDATE ON admins
  BEGIN UPDATE admins SET updated_at = datetime('now') WHERE id = NEW.id; END;

-- invite_codes
CREATE TABLE IF NOT EXISTS invite_codes (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  code       TEXT NOT NULL UNIQUE,
  used_by    TEXT REFERENCES admins(id),
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

-- stores
CREATE TABLE IF NOT EXISTS stores (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  admin_id        TEXT NOT NULL REFERENCES admins(id),
  name            TEXT NOT NULL,
  address         TEXT,
  phone           TEXT,
  timezone        TEXT NOT NULL DEFAULT 'America/Chicago',
  staff_pin_hash  TEXT NOT NULL,
  admin_pin_hash  TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stores_admin ON stores(admin_id);

CREATE TRIGGER IF NOT EXISTS stores_updated_at AFTER UPDATE ON stores
  BEGIN UPDATE stores SET updated_at = datetime('now') WHERE id = NEW.id; END;

-- store_sessions
CREATE TABLE IF NOT EXISTS store_sessions (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  store_id   TEXT NOT NULL REFERENCES stores(id),
  opened_at  TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_store_sessions_store ON store_sessions(store_id);

-- customers (no store_id — cross-store shared by phone)
CREATE TABLE IF NOT EXISTS customers (
  id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  phone                   TEXT NOT NULL UNIQUE,
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  email                   TEXT,
  address                 TEXT,
  date_of_birth           TEXT,
  gender                  TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  staff_notes             TEXT DEFAULT '',
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers(last_name, first_name);

CREATE TRIGGER IF NOT EXISTS customers_updated_at AFTER UPDATE ON customers
  BEGIN UPDATE customers SET updated_at = datetime('now') WHERE id = NEW.id; END;

-- intake_forms (one per customer — UNIQUE(customer_id))
CREATE TABLE IF NOT EXISTS intake_forms (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  form_version     INTEGER NOT NULL DEFAULT 1,
  form_data        TEXT NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'client_signed',
  client_signed_at    TEXT,
  last_reviewed_at    TEXT,
  completed_at        TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(customer_id)
);

CREATE INDEX IF NOT EXISTS idx_intake_forms_customer ON intake_forms(customer_id);

CREATE TRIGGER IF NOT EXISTS intake_forms_updated_at AFTER UPDATE ON intake_forms
  BEGIN UPDATE intake_forms SET updated_at = datetime('now') WHERE id = NEW.id; END;

-- visits (no updated_at — per design)
CREATE TABLE IF NOT EXISTS visits (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  store_id         TEXT NOT NULL REFERENCES stores(id),
  visit_date       TEXT NOT NULL DEFAULT (datetime('now')),
  service_type     TEXT,
  therapist_name   TEXT,
  notes            TEXT,
  therapist_service_technique   TEXT,
  therapist_body_parts_notes    TEXT,
  therapist_signature_data_url  TEXT,
  therapist_signed_at           TEXT,
  cancelled_at     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_visits_customer  ON visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_visits_store     ON visits(store_id);
CREATE INDEX IF NOT EXISTS idx_visits_date      ON visits(visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_visits_therapist ON visits(therapist_name);
CREATE INDEX IF NOT EXISTS idx_visits_store_pending ON visits(store_id, therapist_signed_at, cancelled_at);
