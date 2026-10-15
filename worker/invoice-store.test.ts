import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newOrder } from '../src/invoice/model.ts';
import { InvoiceStore, Conflict, type InvoiceDB, type Statement } from './invoice-store.ts';
import { MemoryDB } from './invoice-test-db.ts';

test('real SQLite migration stores revisions atomically and rejects stale writers',async () => {
  const db=new MemoryDB(), store=new InvoiceStore(db), order=newOrder();
  order.customer.name='Synthetic customer'; order.rateCents=3000;
  order.runs=[{id:'front',name:'front',lengthFt:200,startNode:'A',endNode:'B'}];
  const first=await store.create(order,'seller@example.test');
  assert.equal(first.version,1); assert.match(first.number,/^EST-/);
  const changed=structuredClone(order); changed.rateCents=3100;
  const second=await store.append(first,changed,[],'invoice','other@example.test');
  assert.equal(second.version,2); assert.match(second.number,/^DFM-/);
  await assert.rejects(store.append(first,order,[],'estimate','seller@example.test'),Conflict);
  assert.equal((await store.get(first.id))?.version,2);
  assert.equal((await store.get(first.id,1))?.order.rateCents,3000);
  assert.equal((await store.get(first.id,1))?.kind,'estimate');
  assert.equal((await store.list('Synthetic'))[0].total_cents,620000);
  assert.equal((await store.history(first.id)).length,2);
  db.connection.close();
});
test('rollback leaves no orphan document when a batch fails',async () => {
  const db=new MemoryDB();
  await assert.rejects(db.batch([
    db.prepare('INSERT INTO invoice_documents (id, created_at, updated_at, kind) VALUES (?, ?, ?, ?)').bind('bad','now','now','estimate'),
    db.prepare('INSERT INTO invoice_revisions (document_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)').bind('bad',2,'{}','seller','now'),
  ]));
  assert.equal(await db.prepare('SELECT id FROM invoice_documents WHERE id = ?').bind('bad').first(),null);
  db.connection.close();
});


function syntheticOrder() {
  const order = newOrder();
  order.customer = { name:'Synthetic customer',email:'customer@example.test',phone:'5550100',address:'Synthetic site' };
  order.rateCents = 3000;
  order.runs = [{ id:'front',name:'Front',lengthFt:200,startNode:'A',endNode:'B' }];
  return order;
}

function counts(db: MemoryDB) {
  return {
    documents: Number((db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_documents').get() as { n:number }).n),
    revisions: Number((db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_revisions').get() as { n:number }).n),
  };
}

// Actual SQLite statements; only an independent post-write read is unavailable.
function unreadableAfterCommit(db: MemoryDB) {
  let written = false, batchDepth = 0, independentReads = 0;
  const readUnavailable = (sql: string) => {
    if (written && !batchDepth && /^\s*SELECT\b/i.test(sql)) { independentReads += 1; return true; }
    return false;
  };
  const markWrite = (sql: string) => { if (!/^\s*SELECT\b/i.test(sql)) written = true; };
  const wrap = (sql: string, statement: Statement): Statement => ({
    bind: (...values: unknown[]) => wrap(sql,statement.bind(...values)),
    async first<T>(): Promise<T | null> {
      if (readUnavailable(sql)) return null;
      const result = await statement.first<T>(); markWrite(sql); return result;
    },
    async all<T>(): Promise<{ results:T[] }> {
      if (readUnavailable(sql)) return { results:[] };
      const result = await statement.all<T>(); markWrite(sql); return result;
    },
    async run() {
      if (readUnavailable(sql)) throw new Error('Synthetic independent read unavailable');
      const result = await statement.run(); markWrite(sql); return result;
    },
  });
  const adapter: InvoiceDB = {
    prepare: (sql) => wrap(sql,db.prepare(sql)),
    async batch(statements) {
      batchDepth += 1;
      try { const result = await db.batch(statements); written = true; return result; }
      finally { batchDepth -= 1; }
    },
  };
  return { adapter, reads: () => independentReads };
}

// One DatabaseSync connection cannot host overlapping transactions.
// Queue batches as D1 atomic transactions; all SQL still runs in MemoryDB.
function serialBatches(db: MemoryDB): InvoiceDB {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    prepare: (sql) => db.prepare(sql),
    batch(statements) {
      const result = tail.then(() => db.batch(statements));
      tail = result.catch(() => undefined);
      return result;
    },
  };
}

function wrappedSqliteErrors(db: MemoryDB): InvoiceDB {
  async function run<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (cause) {
      throw new Error('D1_ERROR: query execution failed', {
        cause: new Error('D1 statement failed', { cause }),
      });
    }
  }
  const wrap = (statement: Statement): Statement => ({
    bind: (...values: unknown[]) => wrap(statement.bind(...values)),
    first: <T>() => run(() => statement.first<T>()),
    all: <T>() => run(() => statement.all<T>()),
    run: () => run(() => statement.run()),
  });
  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    batch: (statements) => run(() => db.batch(statements)),
  };
}

test('immutable revisions reject SQL UPDATE and preserve the original snapshot',async (t) => {
  const db = new MemoryDB(); t.after(() => db.connection.close());
  const store = new InvoiceStore(db), first = await store.create(syntheticOrder(),'seller@example.test');
  const before = await db.prepare('SELECT * FROM invoice_revisions WHERE document_id = ?').bind(first.id).first();
  const projection = await db.prepare('SELECT * FROM invoice_documents WHERE id = ?').bind(first.id).first();
  await assert.rejects(db.prepare(
    'UPDATE invoice_revisions SET snapshot = json_set(snapshot, ?, ?), actor = ? WHERE document_id = ? AND version = 1',
  ).bind('$.totals.totalCents',1,'tampered@example.test',first.id).run());
  assert.deepEqual(await db.prepare('SELECT * FROM invoice_revisions WHERE document_id = ?').bind(first.id).first(),before);
  assert.deepEqual(await db.prepare('SELECT * FROM invoice_documents WHERE id = ?').bind(first.id).first(),projection);
});

test('immutable revisions reject SQL DELETE even without a send record',async (t) => {
  const db = new MemoryDB(); t.after(() => db.connection.close());
  const store = new InvoiceStore(db), first = await store.create(syntheticOrder(),'seller@example.test');
  await assert.rejects(db.prepare('DELETE FROM invoice_revisions WHERE document_id = ? AND version = 1').bind(first.id).run());
  assert.deepEqual(await store.get(first.id,1),first);
  assert.deepEqual(counts(db),{ documents:1,revisions:1 });
});

test('document projections reject direct tampering but allow the next revision trigger',async (t) => {
  const db = new MemoryDB(); t.after(() => db.connection.close());
  const store = new InvoiceStore(db), order = syntheticOrder();
  const first = await store.create(order,'seller@example.test');
  const before = await db.prepare('SELECT * FROM invoice_documents WHERE id = ?').bind(first.id).first();
  const updates = [
    'UPDATE invoice_documents SET version = 99 WHERE id = ?',
    'UPDATE invoice_documents SET total_cents = 1 WHERE id = ?',
    'UPDATE invoice_documents SET balance_cents = 1 WHERE id = ?',
    'UPDATE invoice_documents SET customer_name = \'Tampered\' WHERE id = ?',
    'UPDATE invoice_documents SET kind = \'invoice\' WHERE id = ?',
    'UPDATE invoice_documents SET updated_at = \'tampered\' WHERE id = ?',
  ];
  for (const sql of updates) {
    await assert.rejects(db.prepare(sql).bind(first.id).run());
    assert.deepEqual(await db.prepare('SELECT * FROM invoice_documents WHERE id = ?').bind(first.id).first(),before);
  }
  const changed = structuredClone(order); changed.rateCents = 3100;
  const second = await store.append(first,changed,[],'invoice','seller@example.test');
  assert.equal(second.version,2);
  const row = await db.prepare('SELECT * FROM invoice_documents WHERE id = ?').bind(first.id).first<Record<string,unknown>>();
  assert.equal(row?.version,2); assert.equal(row?.kind,'invoice');
  assert.equal(row?.total_cents,620000); assert.equal(row?.balance_cents,620000);
  assert.equal(row?.updated_at,second.updatedAt);
  await assert.rejects(store.append(first,order,[],'estimate','seller@example.test'),Conflict);
});

test('creation returns its committed write result without an independent follow-up read',async (t) => {
  const db = new MemoryDB(); t.after(() => db.connection.close());
  const unavailable = unreadableAfterCommit(db), store = new InvoiceStore(unavailable.adapter);
  const order = syntheticOrder(), creationKey = crypto.randomUUID();
  const first = await store.create(order,'seller@example.test',creationKey);
  assert.deepEqual(counts(db),{ documents:1,revisions:1 });
  assert.ok(first,'a committed creation must return its document even when independent reads are unavailable');
  assert.equal(unavailable.reads(),0);
  assert.equal(first.id,creationKey); assert.equal(first.version,1);
  assert.deepEqual(first.order,order); assert.deepEqual(first.payments,[]);
  assert.deepEqual(await new InvoiceStore(db).get(first.id,1),first);
});

test('append returns its exact committed revision without an independent follow-up read',async (t) => {
  const db = new MemoryDB(); t.after(() => db.connection.close());
  const order = syntheticOrder(), first = await new InvoiceStore(db).create(order,'seller@example.test');
  const unavailable = unreadableAfterCommit(db), store = new InvoiceStore(unavailable.adapter);
  const changed = structuredClone(order); changed.rateCents = 3100;
  const payments = [{ id:crypto.randomUUID(),amountCents:100000,date:'2026-10-14',method:'cash',note:'' }];
  const second = await store.append(first,changed,payments,'invoice','other@example.test');
  assert.deepEqual(counts(db),{ documents:1,revisions:2 });
  assert.ok(second,'a committed append must return its revision even when independent reads are unavailable');
  assert.equal(unavailable.reads(),0);
  assert.equal(second.id,first.id); assert.equal(second.seq,first.seq); assert.equal(second.version,2);
  assert.equal(second.createdAt,first.createdAt); assert.equal(second.kind,'invoice');
  assert.equal(second.actor,'other@example.test');
  assert.deepEqual(second.order,changed); assert.deepEqual(second.payments,payments);
  assert.deepEqual(await new InvoiceStore(db).get(first.id,2),second);
});

test('same creationKey retry returns the original creation even after later revisions',async (t) => {
  const db = new MemoryDB(); t.after(() => db.connection.close());
  const store = new InvoiceStore(db), order = syntheticOrder(), creationKey = crypto.randomUUID();
  const first = await store.create(order,'seller@example.test',creationKey);
  const replay = await new InvoiceStore(db).create(structuredClone(order),'seller@example.test',creationKey);
  assert.equal(first.id,creationKey); assert.deepEqual(replay,first);
  assert.deepEqual(counts(db),{ documents:1,revisions:1 });
  const changed = structuredClone(order); changed.rateCents = 3100;
  await store.append(first,changed,[],'invoice','seller@example.test');
  const original = await new InvoiceStore(db).create(order,'seller@example.test',creationKey);
  assert.deepEqual(original,first);
  assert.equal((await store.get(first.id))?.version,2);
  assert.deepEqual(counts(db),{ documents:1,revisions:2 });
});

test('concurrent same-key creations use database uniqueness and return one creation',async (t) => {
  const db = new MemoryDB(); t.after(() => db.connection.close());
  const adapter = serialBatches(db), order = syntheticOrder(), creationKey = crypto.randomUUID();
  const [left,right] = await Promise.all([
    new InvoiceStore(adapter).create(order,'seller@example.test',creationKey),
    new InvoiceStore(adapter).create(structuredClone(order),'seller@example.test',creationKey),
  ]);
  assert.equal(left.id,creationKey); assert.deepEqual(right,left);
  assert.deepEqual(counts(db),{ documents:1,revisions:1 });
});

test('same creationKey with a different payload raises Conflict without changing history',async (t) => {
  const db = new MemoryDB(); t.after(() => db.connection.close());
  const store = new InvoiceStore(db), order = syntheticOrder(), creationKey = crypto.randomUUID();
  const first = await store.create(order,'seller@example.test',creationKey);
  const changed = structuredClone(order); changed.rateCents = 3100;
  await assert.rejects(new InvoiceStore(db).create(changed,'seller@example.test',creationKey),Conflict);
  assert.deepEqual(counts(db),{ documents:1,revisions:1 });
  assert.deepEqual(await store.get(first.id,1),first);
});

test('stale revision conflict is recognized through nested D1 Error.cause wrappers',async (t) => {
  const db = new MemoryDB(); t.after(() => db.connection.close());
  const store = new InvoiceStore(db), order = syntheticOrder();
  const first = await store.create(order,'seller@example.test');
  const changed = structuredClone(order); changed.rateCents = 3100;
  await store.append(first,changed,[],'invoice','seller@example.test');
  await assert.rejects(
    new InvoiceStore(wrappedSqliteErrors(db)).append(first,order,[],'estimate','seller@example.test'),
    Conflict,
  );
  assert.deepEqual(counts(db),{ documents:1,revisions:2 });
});
