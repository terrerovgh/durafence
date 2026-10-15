CREATE TABLE invoice_documents (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('estimate', 'invoice')),
  customer_name TEXT NOT NULL DEFAULT '',
  total_cents INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE invoice_revisions (
  document_id TEXT NOT NULL REFERENCES invoice_documents(id),
  version INTEGER NOT NULL CHECK (version > 0),
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (document_id, version)
);
CREATE TRIGGER invoice_revision_guard BEFORE INSERT ON invoice_revisions
BEGIN
  SELECT CASE WHEN NEW.version != (SELECT version + 1 FROM invoice_documents WHERE id = NEW.document_id)
    OR NOT EXISTS (SELECT 1 FROM invoice_documents WHERE id = NEW.document_id)
    THEN RAISE(ABORT, 'invoice_version_conflict') END;
END;
CREATE TRIGGER invoice_revision_apply AFTER INSERT ON invoice_revisions
BEGIN
  UPDATE invoice_documents SET version = NEW.version, updated_at = NEW.created_at,
    kind = json_extract(NEW.snapshot, '$.kind'),
    customer_name = json_extract(NEW.snapshot, '$.order.customer.name'),
    total_cents = json_extract(NEW.snapshot, '$.totals.totalCents'),
    balance_cents = json_extract(NEW.snapshot, '$.totals.balanceCents')
    WHERE id = NEW.document_id;
END;
CREATE INDEX invoice_documents_updated ON invoice_documents(updated_at DESC);
CREATE TABLE invoice_sends (
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending', 'sent', 'unknown', 'failed')),
  provider_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (document_id, version),
  FOREIGN KEY (document_id, version) REFERENCES invoice_revisions(document_id, version)
);

