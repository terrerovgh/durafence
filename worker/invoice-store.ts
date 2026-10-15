import { calculate, type Order, type Payment, type StoredInvoice } from '../src/invoice/model.ts';

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface InvoiceDB {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export class Conflict extends Error {}
type Snapshot = { order: Order; payments: Payment[]; kind: 'estimate' | 'invoice'; totals: ReturnType<typeof calculate> };
type Row = { id: string; seq: number; version: number; created_at: string; updated_at: string; actor: string; snapshot: string };
export function documentNumber(seq: number, kind: string, createdAt: string): string {
  return (kind === 'invoice' ? 'DFM-' : 'EST-') + createdAt.slice(0, 4) + '-' + String(seq).padStart(6, '0');
}
function unpack(row: Row): StoredInvoice {
  const snapshot = JSON.parse(row.snapshot) as Snapshot;
  return { id: row.id, seq: row.seq, version: row.version, kind: snapshot.kind,
    number: documentNumber(row.seq, snapshot.kind, row.created_at), createdAt: row.created_at, updatedAt: row.updated_at,
    actor: row.actor, order: snapshot.order, payments: snapshot.payments };
}
export function isCreationKey(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key,canonical(record[key])]));
  }
  return value;
}
function revisionConflict(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 16 && !seen.has(current); depth += 1) {
    seen.add(current);
    const entry = typeof current === 'object' ? current as { message?: unknown; cause?: unknown } : null;
    const message = typeof current === 'string' ? current : typeof entry?.message === 'string' ? entry.message : '';
    if (/\binvoice_version_conflict\b|UNIQUE constraint failed:\s*invoice_revisions\.(?:document_id|version)\b/i.test(message)) return true;
    current = entry?.cause;
  }
  return false;
}
export class InvoiceStore {
  readonly db: InvoiceDB;
  constructor(db: InvoiceDB) { this.db = db; }
  async get(id: string, version?: number): Promise<StoredInvoice | null> {
    const row = await this.db.prepare(
      'SELECT d.id, d.seq, r.version, d.created_at, r.created_at AS updated_at, r.actor, r.snapshot FROM invoice_documents d JOIN invoice_revisions r ON r.document_id = d.id AND r.version = COALESCE(?, d.version) WHERE d.id = ?',
    ).bind(version ?? null, id).first<Row>();
    return row ? unpack(row) : null;
  }
  async list(query = '', beforeSeq = 0): Promise<Record<string, unknown>[]> {
    const rows = await this.db.prepare(
      'SELECT id, seq, version, kind, created_at, updated_at, customer_name, total_cents, balance_cents FROM invoice_documents WHERE (? = 0 OR seq < ?) AND instr(lower(customer_name), lower(?)) > 0 ORDER BY seq DESC LIMIT 50',
    ).bind(beforeSeq, beforeSeq, query).all<{ seq: number; kind: string; created_at: string } & Record<string, unknown>>();
    return rows.results.map((row) => ({ ...row, number: documentNumber(row.seq, row.kind, row.created_at) }));
  }
  async history(id: string): Promise<Record<string, unknown>[]> {
    return (await this.db.prepare('SELECT r.version, r.actor, r.created_at, s.state AS send_state FROM invoice_revisions r LEFT JOIN invoice_sends s ON s.document_id = r.document_id AND s.version = r.version WHERE r.document_id = ? ORDER BY r.version DESC').bind(id).all()).results;
  }
  async create(order: Order, actor: string, creationKey?: string): Promise<StoredInvoice> {
    const key = creationKey === undefined ? crypto.randomUUID() : creationKey;
    if (!isCreationKey(key)) throw new Error('Clave de creacion no valida.');
    const id = key.toLowerCase(), now = new Date().toISOString();
    const seller = actor.trim().toLowerCase();
    if (!seller) throw new Error('Autor del documento no valido.');
    const submitted = structuredClone(order);
    const snapshot: Snapshot = { order: submitted, payments: [], kind: 'estimate', totals: calculate(submitted) };
    const results = await this.db.batch([
      this.db.prepare(
        'INSERT INTO invoice_documents (id, created_at, updated_at, kind) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM invoice_documents WHERE id = ?) ON CONFLICT(id) DO NOTHING',
      ).bind(id, now, now, 'estimate', id),
      this.db.prepare(
        'INSERT INTO invoice_revisions (document_id, version, snapshot, actor, created_at) SELECT ?, 1, ?, ?, ? WHERE EXISTS (SELECT 1 FROM invoice_documents WHERE id = ? AND version = 0) AND NOT EXISTS (SELECT 1 FROM invoice_revisions WHERE document_id = ? AND version = 1)',
      ).bind(id, JSON.stringify(snapshot), seller, now, id, id),
      this.db.prepare(
        'SELECT d.id, d.seq, r.version, d.created_at, r.created_at AS updated_at, r.actor, r.snapshot FROM invoice_documents d JOIN invoice_revisions r ON r.document_id = d.id AND r.version = 1 WHERE d.id = ?',
      ).bind(id),
    ]);
    const row = (results[2] as { results?: Row[] } | undefined)?.results?.[0];
    if (!row || row.id !== id || row.version !== 1) throw new Error('Creation write did not return its committed revision.');
    const original = unpack(row);
    if (original.actor !== seller || JSON.stringify(canonical(original.order)) !== JSON.stringify(canonical(submitted))) {
      throw new Conflict('Esta clave de creacion ya pertenece a otro acuerdo o vendedor. No se creo otro documento.');
    }
    return original;
  }
  async append(previous: StoredInvoice, order: Order, payments: Payment[], kind: StoredInvoice['kind'], actor: string): Promise<StoredInvoice> {
    const now = new Date().toISOString(), version = previous.version + 1;
    const committedOrder = structuredClone(order), committedPayments = structuredClone(payments);
    const snapshot: Snapshot = { order: committedOrder, payments: committedPayments, kind, totals: calculate(committedOrder, committedPayments) };
    const committed: StoredInvoice = {
      ...previous, version, kind, number: documentNumber(previous.seq, kind, previous.createdAt),
      updatedAt: now, actor, order: committedOrder, payments: committedPayments,
    };
    try {
      const written = await this.db.prepare('INSERT INTO invoice_revisions (document_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(committed.id, version, JSON.stringify(snapshot), actor, now).run();
      if (!Number.isSafeInteger(written.meta.changes) || Number(written.meta.changes) < 1) {
        throw new Error('Revision write was not confirmed.');
      }
    } catch (error) {
      if (revisionConflict(error)) throw new Conflict('Otro vendedor guardo cambios. Recarga antes de guardar.');
      throw error;
    }
    return committed;
  }
}
