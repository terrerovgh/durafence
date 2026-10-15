import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleInvoiceArea, isInvoiceArea, type InvoiceEnv } from './invoice-api.ts';
import { newOrder } from '../src/invoice/model.ts';
import { MemoryDB, accessFixture } from './invoice-test-db.ts';

test('private route refuses missing config and identity, including alternate encodings',async () => {
  const env:InvoiceEnv={ASSETS:{fetch:async () => new Response('private shell')}};
  assert.equal((await handleInvoiceArea(new Request('https://example.test/invoice/'),env)).status,503);
  env.INVOICE_ACCESS_ISSUER='https://invoice-test.cloudflareaccess.com'; env.INVOICE_ACCESS_AUD='synthetic-audience';
  assert.equal((await handleInvoiceArea(new Request('https://example.test/invoice/'),env)).status,403);
  assert.ok(isInvoiceArea('/invoice/index.html'));
  const encoded='/inv'+String.fromCharCode(37)+'6fice/';
  assert.ok(isInvoiceArea(encoded));
  assert.equal(isInvoiceArea('/estimate/'),false);
});

test('private CRUD, conversion, payments, history, preview and idempotent mail work together',async () => {
  const fixture=await accessFixture(), db=new MemoryDB(), originalFetch=globalThis.fetch;
  let sent=0;
  globalThis.fetch=async (input) => {
    const url=String(input);
    if(url===fixture.issuer+'/cdn-cgi/access/certs') return new Response(JSON.stringify({keys:[fixture.key]}),{headers:{'content-type':'application/json'}});
    if(url==='https://api.resend.com/emails') { sent+=1; return new Response(JSON.stringify({id:'synthetic-message'})); }
    throw new Error('Unexpected external fetch in test');
  };
  try {
    const token=await fixture.issue();
    const env:InvoiceEnv={INVOICE_DB:db,INVOICE_ACCESS_ISSUER:fixture.issuer,INVOICE_ACCESS_AUD:fixture.audience,
      RESEND_API_KEY:'synthetic-provider-key',ASSETS:{fetch:async () => new Response('private shell')}};
    const request=(path:string,method='GET',body?:unknown,origin='https://example.test') => new Request(origin+'/api/invoices'+path,{
      method,headers:{'cf-access-jwt-assertion':token,origin,'content-type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    const order=newOrder(); order.rateCents=3000;
    order.customer={name:'Synthetic Customer',email:'customer@example.test',phone:'5550100',address:'Synthetic project'};
    order.runs=[{id:'front',name:'Front',lengthFt:200,startNode:'A',endNode:'B'}];
    const denied=request('','POST',{order}); denied.headers.set('origin','https://other.test');
    assert.equal((await handleInvoiceArea(denied,env)).status,403);
    const created=await handleInvoiceArea(request('','POST',{order,creationKey:crypto.randomUUID()}),env);
    assert.equal(created.status,201); assert.equal(created.headers.get('cache-control'),'private, no-store');
    let document=(await created.json()).document;
    const id=document.id;
    const updated=structuredClone(order); updated.cameras.included=2;
    document=(await (await handleInvoiceArea(request('/'+id,'PUT',{version:1,order:updated}),env)).json()).document;
    assert.equal(document.version,2);
    assert.equal((await handleInvoiceArea(request('/'+id,'PUT',{version:1,order}),env)).status,409);
    document=(await (await handleInvoiceArea(request('/'+id+'/convert','POST',{version:2}),env)).json()).document;
    assert.equal(document.kind,'invoice'); assert.equal(document.version,3);
    document=(await (await handleInvoiceArea(request('/'+id+'/payments','POST',{version:3,amountCents:100000,date:'2026-10-14',method:'cash',note:''}),env)).json()).document;
    assert.equal(document.payments.length,1);
    const old=await handleInvoiceArea(request('/'+id+'?version=1'),env);
    assert.equal((await old.json()).document.kind,'estimate');
    const pdf=await handleInvoiceArea(request('/'+id+'/pdf?version=4'),env);
    assert.equal(pdf.headers.get('content-type'),'application/pdf'); assert.ok((await pdf.arrayBuffer()).byteLength>1000);
    const preview=await handleInvoiceArea(request('/preview','POST',{order:updated,id,version:4}),env);
    assert.equal(preview.status,200);
    const send=await handleInvoiceArea(request('/'+id+'/send','POST',{version:4}),env);
    assert.equal(send.status,200);
    const duplicate=await handleInvoiceArea(request('/'+id+'/send','POST',{version:4}),env);
    assert.equal(duplicate.status,200); assert.equal(sent,1);
    const revisions=await handleInvoiceArea(request('/'+id+'/history'),env);
    assert.equal((await revisions.json()).revisions[0].send_state,'sent');
    const results=await handleInvoiceArea(request('/search','POST',{query:'Synthetic',before:0}),env);
    assert.equal((await results.json()).documents.length,1);
    document=(await (await handleInvoiceArea(request('/'+id+'/payments','POST',{version:4,reverses:document.payments[0].id,date:'2026-10-15',method:'reversal',note:''}),env)).json()).document;
    assert.equal(document.payments.length,2); assert.equal(document.payments[1].amountCents,-100000);
  } finally { globalThis.fetch=originalFetch; db.connection.close(); }
});


function creationOrder() {
  const order = newOrder();
  order.rateCents = 3000;
  order.customer = { name:'Synthetic customer',email:'customer@example.test',phone:'5550100',address:'Synthetic site' };
  order.runs = [{ id:'front',name:'Front',lengthFt:200,startNode:'A',endNode:'B' }];
  return order;
}

async function withCreationAPI(run: (
  post: (body: unknown, token?: string) => Promise<Response>,
  db: MemoryDB,
  fixture: Awaited<ReturnType<typeof accessFixture>>,
) => Promise<void>) {
  const db = new MemoryDB(), originalFetch = globalThis.fetch;
  try {
    const fixture = await accessFixture(), token = await fixture.issue();
    globalThis.fetch = async (input) => {
      if (String(input) === fixture.issuer + '/cdn-cgi/access/certs') {
        return new Response(JSON.stringify({ keys:[fixture.key] }),{ headers:{ 'content-type':'application/json' } });
      }
      throw new Error('Unexpected external fetch in creation test');
    };
    const env: InvoiceEnv = {
      INVOICE_DB:db,INVOICE_ACCESS_ISSUER:fixture.issuer,INVOICE_ACCESS_AUD:fixture.audience,
      ASSETS:{ fetch:async () => new Response('private shell') },
    };
    const post = (body: unknown, signedToken = token) => handleInvoiceArea(
      new Request('https://example.test/api/invoices',{
        method:'POST',headers:{
          origin:'https://example.test','content-type':'application/json','cf-access-jwt-assertion':signedToken,
        },
        body:JSON.stringify(body),
      }),env,
    );
    await run(post,db,fixture);
  } finally { globalThis.fetch = originalFetch; db.connection.close(); }
}

test('creation API retries a lost response using one client UUID and one stored revision',async () => {
  await withCreationAPI(async (post,db) => {
    const order = creationOrder(), creationKey = crypto.randomUUID();
    // The server commits; the client never receives/consumes the first response.
    const lost = await post({ order,creationKey });
    assert.equal(lost.status,201);
    const retried = await post({ order:structuredClone(order),creationKey });
    assert.equal(retried.status,201);
    const result = await retried.json();
    assert.equal(result.document.id,creationKey); assert.equal(result.document.version,1);
    assert.deepEqual(result.document.order,order);
    const again = await post({ order,creationKey });
    assert.equal(again.status,201); assert.deepEqual(await again.json(),result);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_documents').get()?.n,1);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_revisions').get()?.n,1);
  });
});

test('creation API returns 409 for a conflicting payload with the same creationKey',async () => {
  await withCreationAPI(async (post,db) => {
    const order = creationOrder(), creationKey = crypto.randomUUID();
    const response = await post({ order,creationKey }); assert.equal(response.status,201);
    const first = await response.json();
    const changed = structuredClone(order); changed.rateCents = 3100;
    const conflict = await post({ order:changed,creationKey });
    assert.equal(conflict.status,409); assert.equal((await conflict.json()).ok,false);
    const retry = await post({ order,creationKey });
    assert.equal(retry.status,201); assert.deepEqual(await retry.json(),first);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_documents').get()?.n,1);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_revisions').get()?.n,1);
  });
});

test('creation API rejects missing or malformed creationKey before any write',async () => {
  await withCreationAPI(async (post,db) => {
    const order = creationOrder();
    for (const creationKey of [undefined,null,7,{},'', 'not-a-uuid','g'.repeat(36)]) {
      assert.equal((await post({ order,creationKey })).status,400);
    }
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_documents').get()?.n,0);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_revisions').get()?.n,0);
    const accepted = await post({ order,creationKey:crypto.randomUUID() });
    assert.equal(accepted.status,201);
  });
});

test('creation API rejects signed non-finite dates before writing to SQLite',async () => {
  await withCreationAPI(async (post,db,fixture) => {
    const order = creationOrder();
    for (const entry of [{ claim:'exp',literal:'1e309' },{ claim:'nbf',literal:'-1e309' }]) {
      const claims = {
        iss:fixture.issuer,aud:[fixture.audience],email:'seller@example.test',exp:Math.floor(Date.now()/1000)+300,
        [entry.claim]:'SIGNED_NUMBER_LITERAL',
      };
      const raw = JSON.stringify(claims).replace(JSON.stringify('SIGNED_NUMBER_LITERAL'),entry.literal);
      const token = await fixture.issueRaw(raw);
      assert.equal((await post({ order,creationKey:crypto.randomUUID() },token)).status,403);
    }
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_documents').get()?.n,0);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_revisions').get()?.n,0);
  });
});

test('private overflow allows storage but blocks preview/download/send before ledger reservation', async () => {
  const fixture = await accessFixture(), db = new MemoryDB(), originalFetch = globalThis.fetch;
  let sent = 0, attachmentPages = 0;
  globalThis.fetch = async (input, options) => {
    if (String(input) === fixture.issuer + '/cdn-cgi/access/certs') return Response.json({keys:[fixture.key]});
    if (String(input) === 'https://api.resend.com/emails') {
      sent += 1;
      const message = JSON.parse(String(options?.body));
      attachmentPages = (await PDFDocument.load(Buffer.from(message.attachments[0].content,'base64'))).getPageCount();
      return Response.json({id:'synthetic-one-page'});
    }
    throw new Error('Unexpected external fetch');
  };
  try {
    const token = await fixture.issue();
    const env: InvoiceEnv = {INVOICE_DB:db,INVOICE_ACCESS_ISSUER:fixture.issuer,INVOICE_ACCESS_AUD:fixture.audience,
      RESEND_API_KEY:'synthetic-key',ASSETS:{fetch:async () => new Response('private shell')}};
    const request = (path: string, method = 'GET', body?: unknown) => new Request('https://example.test/api/invoices' + path,{
      method,headers:{origin:'https://example.test','content-type':'application/json','cf-access-jwt-assertion':token},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}),
    });
    const order = creationOrder(); order.terms = 'T'.repeat(4000);
    const creation = await handleInvoiceArea(request('','POST',{order,creationKey:crypto.randomUUID()}),env);
    assert.equal(creation.status,201);
    const document = (await creation.json()).document;
    for (const response of [
      await handleInvoiceArea(request('/preview','POST',{order,id:document.id,version:1}),env),
      await handleInvoiceArea(request('/' + document.id + '/pdf?download=1'),env),
      await handleInvoiceArea(request('/' + document.id + '/send','POST',{version:1}),env),
    ]) {
      assert.equal(response.status,422); assert.equal(response.headers.get('cache-control'),'private, no-store');
      const body = await response.json();
      assert.equal(body.error,'pdf_layout_overflow'); assert.match(body.message,/una sola pagina Letter/);
      assert.doesNotMatch(body.message,/T{20}|seller@example/);
    }
    assert.equal(sent,0);
    assert.equal(db.connection.prepare('SELECT COUNT(*) AS n FROM invoice_sends').get()?.n,0);
    const persisted = await handleInvoiceArea(request('/' + document.id),env);
    assert.equal((await persisted.json()).document.order.terms,order.terms);
    // A legacy sent outcome stays idempotent even when its old layout no longer fits.
    db.connection.prepare('INSERT INTO invoice_sends (document_id,version,idempotency_key,state,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(document.id,1,'synthetic-legacy','sent','2026-10-14T12:00:00Z','2026-10-14T12:00:00Z');
    assert.equal((await handleInvoiceArea(request('/' + document.id + '/send','POST',{version:1}),env)).status,200);
    assert.equal(sent,0);
    order.terms = 'Confirm dimensions before installation.';
    const updated = await handleInvoiceArea(request('/' + document.id,'PUT',{version:1,order}),env);
    assert.equal(updated.status,200);
    const normal = await handleInvoiceArea(request('/' + document.id + '/pdf?version=2'),env);
    assert.equal(normal.status,200);
    assert.equal((await PDFDocument.load(await normal.arrayBuffer())).getPageCount(),1);
    assert.equal((await handleInvoiceArea(request('/' + document.id + '/send','POST',{version:2}),env)).status,200);
    assert.equal(sent,1); assert.equal(attachmentPages,1);
    assert.equal((await handleInvoiceArea(request('/' + document.id + '/send','POST',{version:2}),env)).status,200);
    assert.equal(sent,1);
  } finally { globalThis.fetch = originalFetch; db.connection.close(); }
});
