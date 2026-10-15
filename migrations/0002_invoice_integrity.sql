-- Preserve 0001 and enforce append-only history on existing databases.
CREATE TRIGGER invoice_revision_no_update
BEFORE UPDATE ON invoice_revisions
BEGIN
  SELECT RAISE(ABORT, 'invoice_revision_immutable');
END;

CREATE TRIGGER invoice_revision_no_delete
BEFORE DELETE ON invoice_revisions
BEGIN
  SELECT RAISE(ABORT, 'invoice_revision_immutable');
END;

-- Block forged initial projections and REPLACE, including SQLite's implicit
-- delete path when recursive delete triggers are disabled.
CREATE TRIGGER invoice_document_initial_guard
BEFORE INSERT ON invoice_documents
WHEN NEW.version IS NOT 0
  OR NEW.kind IS NOT 'estimate'
  OR NEW.customer_name IS NOT ''
  OR NEW.total_cents IS NOT 0
  OR NEW.balance_cents IS NOT 0
  OR EXISTS (SELECT 1 FROM invoice_documents WHERE id = NEW.id OR seq = NEW.seq)
BEGIN
  SELECT RAISE(ABORT, 'invoice_projection_immutable');
END;

-- Only the existing AFTER INSERT revision trigger can advance this projection:
-- the next immutable snapshot must already exist and every projected value match.
CREATE TRIGGER invoice_document_projection_guard
BEFORE UPDATE ON invoice_documents
WHEN NEW.id IS NOT OLD.id
  OR NEW.seq IS NOT OLD.seq
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.version IS NOT (OLD.version + 1)
  OR NOT EXISTS (
    SELECT 1 FROM invoice_revisions r
    WHERE r.document_id = OLD.id AND r.version = NEW.version
      AND NEW.updated_at IS r.created_at
      AND NEW.kind IS json_extract(r.snapshot, '$.kind')
      AND NEW.customer_name IS json_extract(r.snapshot, '$.order.customer.name')
      AND NEW.total_cents IS json_extract(r.snapshot, '$.totals.totalCents')
      AND NEW.balance_cents IS json_extract(r.snapshot, '$.totals.balanceCents')
  )
BEGIN
  SELECT RAISE(ABORT, 'invoice_projection_immutable');
END;

CREATE TRIGGER invoice_document_no_delete
BEFORE DELETE ON invoice_documents
BEGIN
  SELECT RAISE(ABORT, 'invoice_document_immutable');
END;
