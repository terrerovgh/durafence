import { normalizeOrder, calculate, issuanceIssues, type Payment, type StoredInvoice } from '../src/invoice/model.ts';
import { PdfLayoutOverflowError, PDF_OVERFLOW_ES } from '../src/pdf/layout-error.ts';
import { buildInvoicePdf } from '../src/invoice/pdf.ts';
import { bytesToBase64 } from '../src/data/estimate-pdf.ts';
import { invoiceAddress } from '../src/data/estimate-mail.ts';
import { estimateCopies } from '../functions/api/estimate-email.ts';
import { accessConfigured, authenticateInvoice, privateHeaders, type InvoiceAccessEnv } from './invoice-auth.ts';
import { InvoiceStore, Conflict, isCreationKey, type InvoiceDB } from './invoice-store.ts';

export interface InvoiceEnv extends InvoiceAccessEnv {
  INVOICE_DB?: InvoiceDB;
  ASSETS: { fetch(request: Request): Promise<Response> };
  RESEND_API_KEY?: string;
  RESENT_API_KEY?: string;
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: privateHeaders() });
const fail = (status: number, message: string) => json({ ok: false, message }, status);
function decodedPath(path: string): string {
  try { for (let i = 0; i < 3; i += 1) { const next = decodeURIComponent(path); if (next === path) break; path = next; } } catch {}
  return path.replace(/\/{2,}/g, '/');
}
const area = (raw: string) => {
  const path = decodedPath(raw);
  return path === '/invoice' || path.startsWith('/invoice/') || path === '/api/invoices' || path.startsWith('/api/invoices/');
};
export const isInvoiceArea = area;

async function payload(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Usa JSON para guardar el documento.');
  const stream = request.body?.getReader();
  if (!stream) throw new Error('Falta el documento.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await stream.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > 120000) { await stream.cancel(); throw new Error('Documento demasiado grande.'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const result = JSON.parse(new TextDecoder().decode(bytes));
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Documento no valido.');
  return result;
}
function valid(order: ReturnType<typeof normalizeOrder>): void {
  const issues = calculate(order).issues;
  if (issues.length) throw new Error(issues.join(' '));
}
function pdfResponse(bytes: Uint8Array, number: string, download: boolean): Response {
  const headers = privateHeaders('application/pdf');
  headers.set('content-disposition', (download ? 'attachment' : 'inline') + '; filename=' + number + '.pdf');
  return new Response(bytes as unknown as BodyInit, { headers });
}
function paymentFrom(input: Record<string, unknown>, previous: StoredInvoice): Payment {
  if (previous.payments.length >= 1000) throw new Error('Limite de pagos alcanzado.');
  const date = input.date;
  const method = input.method;
  const note = input.note;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
    || typeof method !== 'string' || !method.trim() || method.length > 40
    || typeof note !== 'string' || note.length > 500) throw new Error('Datos del pago no validos.');
  if (input.reverses !== undefined) {
    const original = previous.payments.find((payment) => payment.id === input.reverses && !payment.reverses);
    if (!original || previous.payments.some((payment) => payment.reverses === original.id)) throw new Error('Este pago ya se anulo o no existe.');
    return { id: crypto.randomUUID(), amountCents: -original.amountCents, date, method: method.trim(), note: note.trim(), reverses: original.id };
  }
  if (!Number.isSafeInteger(input.amountCents) || Number(input.amountCents) <= 0 || Number(input.amountCents) > 100_000_000) throw new Error('Importe del pago no valido.');
  return { id: crypto.randomUUID(), amountCents: Number(input.amountCents), date, method: method.trim(), note: note.trim() };
}

async function sendInvoice(invoice: StoredInvoice, store: InvoiceStore, env: InvoiceEnv): Promise<Response> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.order.customer.email)) return fail(400, 'Indica un email valido para el cliente.');
  const issues = issuanceIssues(invoice.order);
  if (issues.length) return fail(400, issues.join(' '));
  const apiKey = env.RESEND_API_KEY?.trim() || env.RESENT_API_KEY?.trim();
  if (!apiKey) return fail(503, 'El envio de correo no esta configurado.');
  // Preserve prior send outcomes, including old revisions, without reserving a new slot.
  const priorSend = await store.db.prepare('SELECT state FROM invoice_sends WHERE document_id = ? AND version = ?')
    .bind(invoice.id, invoice.version).first<{ state: string }>();
  if (priorSend?.state === 'sent') return json({ ok: true, message: 'Esta revision ya fue enviada.' });
  if (priorSend) return fail(409, 'El envio esta en curso o requiere comprobar su resultado. No se repetira automaticamente.');
  let bytes: Uint8Array;
  try { bytes = await buildInvoicePdf(invoice); }
  catch (error) {
    if (error instanceof PdfLayoutOverflowError) return json({ ok: false, error: 'pdf_layout_overflow', message: PDF_OVERFLOW_ES }, 422);
    return fail(500, 'No se pudo generar el PDF. El correo no se envio.');
  }
  const since = new Date(Date.now() - 3600000).toISOString();
  const key = 'durafence-invoice/' + invoice.id + '/' + invoice.version;
  const now = new Date().toISOString();
  const acquired = await store.db.prepare(
    'INSERT OR IGNORE INTO invoice_sends (document_id, version, idempotency_key, state, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM invoice_sends WHERE created_at >= ?) < 30',
  ).bind(invoice.id, invoice.version, key, 'pending', now, now, since).run();
  if (!acquired.meta.changes) {
    const prior = await store.db.prepare('SELECT state FROM invoice_sends WHERE document_id = ? AND version = ?').bind(invoice.id, invoice.version).first<{ state: string }>();
    if (!prior) return fail(429, 'Limite de 30 envios por hora. Espera antes de enviar otro documento.');
    if (prior.state === 'sent') return json({ ok: true, message: 'Esta revision ya fue enviada.' });
    return fail(409, 'El envio esta en curso o requiere comprobar su resultado. No se repetira automaticamente.');
  }
  const totals = calculate(invoice.order, invoice.payments);
  const title = invoice.kind === 'invoice' ? 'Invoice' : 'Estimate';
  const text = [
    'Hello ' + invoice.order.customer.name + ',', '',
    'Attached is your Dura Fence Metal ' + title.toLowerCase() + ' ' + invoice.number + '.',
    'Project: ' + invoice.order.customer.address,
    'Total: ' + totals.totalCents / 100 + ' USD',
    'Balance: ' + totals.balanceCents / 100 + ' USD', '',
    siteContact(),
  ].join('\n');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({
        from: 'Dura Fence Metal <' + invoiceAddress + '>', to: invoice.order.customer.email,
        bcc: estimateCopies.filter((address) => address.toLowerCase() !== invoice.order.customer.email.toLowerCase()),
        reply_to: invoiceAddress, subject: title + ' ' + invoice.number, text,
        attachments: [{ content: bytesToBase64(bytes), filename: invoice.number + '.pdf', content_type: 'application/pdf' }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const state = response.status >= 500 ? 'unknown' : 'failed';
      await store.db.prepare('UPDATE invoice_sends SET state = ?, updated_at = ? WHERE document_id = ? AND version = ?')
        .bind(state, new Date().toISOString(), invoice.id, invoice.version).run();
      return fail(502, 'El proveedor no confirmo el envio. Comprueba su registro antes de reintentar.');
    }
    const sent = await response.json() as { id?: string };
    if (!sent.id) throw new Error('Missing message ID');
    await store.db.prepare('UPDATE invoice_sends SET state = ?, provider_id = ?, updated_at = ? WHERE document_id = ? AND version = ?')
      .bind('sent', sent.id, new Date().toISOString(), invoice.id, invoice.version).run();
    return json({ ok: true, message: 'Documento enviado al cliente con copia al negocio.' });
  } catch {
    await store.db.prepare('UPDATE invoice_sends SET state = ?, updated_at = ? WHERE document_id = ? AND version = ?')
      .bind('unknown', new Date().toISOString(), invoice.id, invoice.version).run();
    return fail(502, 'Resultado del envio sin confirmar. Comprueba el proveedor antes de cualquier reintento.');
  }
}
const siteContact = () => 'Dura Fence Metal / ' + invoiceAddress;

export async function handleInvoiceArea(request: Request, env: InvoiceEnv): Promise<Response> {
  if (!accessConfigured(env)) return fail(503, 'El dashboard privado aun no esta configurado.');
  const identity = await authenticateInvoice(request, env);
  if (!identity) return fail(403, 'Acceso reservado a vendedores autorizados.');
  const url = new URL(request.url);
  const pathname = decodedPath(url.pathname);
  if (pathname === '/invoice' || pathname.startsWith('/invoice/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'Metodo no admitido.');
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    privateHeaders(response.headers.get('content-type') ?? 'text/html').forEach((value, key) => headers.set(key, value));
    return new Response(response.body, { status: response.status, headers });
  }
  if (!['GET', 'POST', 'PUT'].includes(request.method)) return fail(405, 'Metodo no admitido.');
  if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) return fail(403, 'Origen no autorizado.');
  try {
    if (pathname === '/api/invoices/preview' && request.method === 'POST') {
      const body = await payload(request);
      const order = normalizeOrder(body.order); valid(order);
      const now = new Date().toISOString();
      let preview: StoredInvoice = {
        id: 'preview', seq: 0, version: 0, number: 'DRAFT', kind: 'estimate',
        createdAt: now, updatedAt: now, actor: identity.email, order, payments: [],
      };
      if (body.id !== undefined) {
        if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id) || !env.INVOICE_DB) return fail(400, 'Documento no valido.');
        const saved = await new InvoiceStore(env.INVOICE_DB).get(body.id, Number(body.version));
        if (!saved) return fail(404, 'Revision no encontrada.');
        preview = { ...saved, order };
      }
      return pdfResponse(await buildInvoicePdf(preview), preview.number, false);
    }
    if (!env.INVOICE_DB) return fail(503, 'El historial compartido aun no esta configurado.');
    const store = new InvoiceStore(env.INVOICE_DB);
    if (pathname === '/api/invoices/search' && request.method === 'POST') {
      const body = await payload(request);
      if (typeof body.query !== 'string' || body.query.length > 100 || !Number.isSafeInteger(body.before) || Number(body.before) < 0) return fail(400, 'Busqueda no valida.');
      return json({ ok: true, documents: await store.list(body.query, Number(body.before)) });
    }
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 2) {
      if (request.method === 'GET') {
        const query = (url.searchParams.get('q') ?? '').slice(0, 100);
        const before = Number(url.searchParams.get('before') ?? 0);
        if (!Number.isSafeInteger(before) || before < 0) return fail(400, 'Paginacion no valida.');
        return json({ ok: true, documents: await store.list(query, before) });
      }
      if (request.method === 'POST') {
        const body = await payload(request);
        if (!isCreationKey(body.creationKey)) return fail(400, 'Clave de creacion no valida.');
        const order = normalizeOrder(body.order); valid(order);
        return json({ ok: true, document: await store.create(order, identity.email, body.creationKey) }, 201);
      }
      return fail(405, 'Metodo no admitido.');
    }
    const id = parts[2];
    if (!/^[a-f0-9-]{36}$/.test(id)) return fail(404, 'Documento no encontrado.');
    const action = parts[3] ?? '';
    if (parts.length > 4) return fail(404, 'Ruta no encontrada.');
    const selected = url.searchParams.has('version') ? Number(url.searchParams.get('version')) : undefined;
    if (selected !== undefined && (!Number.isSafeInteger(selected) || selected < 1)) return fail(400, 'Revision no valida.');
    const previous = await store.get(id, request.method === 'GET' ? selected : undefined);
    if (!previous) return fail(404, 'Documento no encontrado.');
    if (request.method === 'GET') {
      if (!action) return json({ ok: true, document: previous });
      if (action === 'history') return json({ ok: true, revisions: await store.history(id) });
      if (action === 'pdf') return pdfResponse(await buildInvoicePdf(previous), previous.number, url.searchParams.get('download') === '1');
      return fail(404, 'Ruta no encontrada.');
    }
    const body = await payload(request);
    if (body.version !== previous.version) return fail(409, 'Otro vendedor guardo cambios. Recarga antes de guardar.');
    if (request.method === 'PUT' && !action) {
      const order = normalizeOrder(body.order); valid(order);
      if (previous.kind === 'invoice') {
        const issues = issuanceIssues(order); if (issues.length) return fail(400, issues.join(' '));
      }
      return json({ ok: true, document: await store.append(previous, order, previous.payments, previous.kind, identity.email) });
    }
    if (request.method === 'POST' && action === 'convert') {
      if (previous.kind === 'invoice') return fail(409, 'El documento ya es un invoice.');
      const issues = issuanceIssues(previous.order); if (issues.length) return fail(400, issues.join(' '));
      return json({ ok: true, document: await store.append(previous, previous.order, previous.payments, 'invoice', identity.email) });
    }
    if (request.method === 'POST' && action === 'payments') {
      if (previous.kind !== 'invoice') return fail(400, 'Convierte el estimado en invoice antes de registrar pagos.');
      const payment = paymentFrom(body, previous);
      return json({ ok: true, document: await store.append(previous, previous.order, [...previous.payments, payment], previous.kind, identity.email) });
    }
    if (request.method === 'POST' && action === 'send') return sendInvoice(previous, store, env);
    return fail(405, 'Metodo o accion no admitido.');
  } catch (error) {
    if (error instanceof PdfLayoutOverflowError) return json({ ok: false, error: 'pdf_layout_overflow', message: PDF_OVERFLOW_ES }, 422);
    if (error instanceof Conflict) return fail(409, error.message);
    if (error instanceof SyntaxError) return fail(400, 'JSON no valido.');
    const message = error instanceof Error ? error.message : '';
    if (/no valid|demasiado|documento|JSON|Seleccion|Cantidad|Texto|Version|compartido|tramo|gate|Altura|descuento|deposito|cargo|camara|Producto|postes|Importe|Indica|pago/i.test(message) && !/D1_|SQL|constraint/i.test(message)) return fail(400, message);
    console.error(JSON.stringify({ event: 'invoice_operation_failed' }));
    return fail(500, 'No se pudo completar la operacion. Tus cambios siguen en el editor.');
  }
}

