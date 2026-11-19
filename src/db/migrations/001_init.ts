/**
 * Phase 1 schema. Conventions (every table):
 *   id TEXT PRIMARY KEY (uuidv7), created_at / updated_at INTEGER (UTC ms),
 *   deleted_at INTEGER NULL (soft delete), sync_version INTEGER.
 * Money columns end in _minor and hold integer minor units.
 * Dates the user thinks in ("which day was this?") are TEXT 'YYYY-MM-DD' local dates.
 */
const common = `
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_version INTEGER NOT NULL DEFAULT 0`;

export const migration001 = `
CREATE TABLE users (${common},
  display_name TEXT,
  default_currency TEXT NOT NULL DEFAULT 'MYR',
  country_code TEXT NOT NULL DEFAULT 'MY',
  remote_id TEXT
);

CREATE TABLE settings (${common},
  user_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE (user_id, key)
);

CREATE TABLE accounts (${common},
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash','bank','credit_card','ewallet','investment','loan')),
  currency TEXT NOT NULL,
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  opening_date TEXT,
  institution TEXT,
  icon TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  include_in_net_worth INTEGER NOT NULL DEFAULT 1,
  credit_limit_minor INTEGER,
  statement_day INTEGER CHECK (statement_day BETWEEN 1 AND 31),
  due_day INTEGER CHECK (due_day BETWEEN 1 AND 31)
);

CREATE TABLE categories (${common},
  user_id TEXT NOT NULL REFERENCES users(id),
  parent_id TEXT REFERENCES categories(id),
  kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
  name TEXT NOT NULL,
  name_key TEXT,
  icon TEXT NOT NULL DEFAULT '🏷️',
  color TEXT NOT NULL DEFAULT '#888888',
  bucket TEXT CHECK (bucket IN ('need','want','savings_debt')),
  tax_relief_code TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  CHECK ((kind = 'income') = (bucket IS NULL))
);

CREATE TABLE merchants (${common},
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  default_category_id TEXT REFERENCES categories(id),
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  UNIQUE (user_id, normalized_name)
);

CREATE TABLE transactions (${common},
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('expense','income','transfer','refund','adjustment')),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  base_amount_minor INTEGER NOT NULL,
  fx_rate_e8 INTEGER,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  to_account_id TEXT REFERENCES accounts(id),
  to_amount_minor INTEGER,
  category_id TEXT REFERENCES categories(id),
  refund_of_id TEXT REFERENCES transactions(id),
  merchant_id TEXT REFERENCES merchants(id),
  note TEXT,
  payment_method TEXT,
  occurred_at INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  recurring_rule_id TEXT,
  commitment_payment_id TEXT,
  receipt_id TEXT,
  lat REAL,
  lng REAL,
  CHECK (type = 'adjustment' OR amount_minor > 0),
  CHECK ((type = 'transfer') = (to_account_id IS NOT NULL)),
  CHECK (to_account_id IS NULL OR to_account_id <> account_id),
  CHECK (type IN ('transfer','adjustment') OR category_id IS NOT NULL OR type = 'expense')
);
CREATE INDEX idx_tx_user_date ON transactions (user_id, local_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tx_account ON transactions (account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tx_to_account ON transactions (to_account_id) WHERE deleted_at IS NULL AND to_account_id IS NOT NULL;
CREATE INDEX idx_tx_category_date ON transactions (category_id, local_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tx_merchant ON transactions (merchant_id) WHERE deleted_at IS NULL;

CREATE TABLE transaction_splits (${common},
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  base_amount_minor INTEGER NOT NULL,
  note TEXT
);
CREATE INDEX idx_splits_tx ON transaction_splits (transaction_id) WHERE deleted_at IS NULL;

CREATE TABLE tags (${common},
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  color TEXT,
  UNIQUE (user_id, name)
);

CREATE TABLE transaction_tags (${common},
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  UNIQUE (transaction_id, tag_id)
);
CREATE INDEX idx_tx_tags_tag ON transaction_tags (tag_id);

CREATE TABLE exchange_rates (${common},
  base TEXT NOT NULL,
  quote TEXT NOT NULL,
  rate_e8 INTEGER NOT NULL CHECK (rate_e8 > 0),
  as_of_date TEXT NOT NULL,
  source TEXT,
  UNIQUE (base, quote, as_of_date)
);

CREATE TABLE sync_log (${common},
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
  synced_at INTEGER
);
CREATE INDEX idx_sync_pending ON sync_log (synced_at) WHERE synced_at IS NULL;
`;
