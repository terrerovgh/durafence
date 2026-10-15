import { bytesToBase64 } from '../../src/data/estimate-pdf.ts';
import { formatSentOn } from '../../src/data/estimate-mail.ts';
import { prepareShopOrder, shopOrderText } from '../../src/data/shop-checkout.ts';
import { buildShopPdf } from '../../src/data/shop-checkout-pdf.ts';
import { contactAddress } from '../../src/data/site.ts';

interface Env { RESEND_API_KEY?: string; RESENT_API_KEY?: string }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const fail = (status: number, error: string, message: string, fields?: Record<string, string>) => json({ ok: false, error, message, fields }, status);

async function overLimit(request: Request): Promise<boolean> {
  try {
    const cache = (globalThis as typeof globalThis & { caches?: { default?: Cache } }).caches?.default;
    if (!cache) return false;
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const hour = Math.floor(Date.now() / 3_600_000);
    const key = new Request(`https://durafencemetal.com/__shop-checkout-limit/${hour}/${encodeURIComponent(ip)}`);
    const hit = await cache.match(key);
    const count = hit ? Number(await hit.text()) : 0;
    if (count >= 30) return true;
    await cache.put(key, new Response(String(count + 1), { headers: { 'cache-control': 'public, max-age=3600' } }));
    return false;
  } catch {
    console.error(JSON.stringify({ event: 'shop_checkout_limit_failed' }));
    return false;
  }
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  if (Number(request.headers.get('content-length')) > 20_000) return fail(413, 'too_large', 'That request is too long.');
  let payload: unknown;
  try {
    const reader = request.body?.getReader();
    let raw = '';
    let size = 0;
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 20_000) { await reader.cancel(); return fail(413, 'too_large', 'That request is too long.'); }
        raw += decoder.decode(chunk.value, { stream: true });
      }
      raw += decoder.decode();
    }
    payload = JSON.parse(raw);
  } catch { return fail(400, 'invalid', 'The order could not be read.'); }
  const prepared = prepareShopOrder(payload);
  if (!prepared.ok) return fail(400, 'invalid', 'Check the highlighted fields.', prepared.fields);
  if (prepared.kind === 'honeypot') return json({ ok: true, message: 'Request received.' });
  const apiKey = env.RESEND_API_KEY?.trim() || env.RESENT_API_KEY?.trim();
  if (!apiKey) return fail(503, 'not_configured', 'Email sending is not ready. Please contact the business.');
  if (await overLimit(request)) return fail(429, 'rate_limited', 'Too many requests from this network. Please try again in an hour.');
  const reference = `DFM-${crypto.randomUUID()}`;
  const date = formatSentOn(new Date());
  const order = prepared.order;
  let pdf: Uint8Array;
  try { pdf = await buildShopPdf(order, reference, date); }
  catch {
    console.error(JSON.stringify({ event: 'shop_checkout_pdf_failed', reference }));
    return fail(500, 'pdf_failed', 'The PDF could not be created. Please try again.');
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: 'Dura Fence Metal <invoice@durafencemetal.com>',
        to: order.customer.email,
        ...(order.customer.email.toLowerCase() !== contactAddress ? { bcc: [contactAddress] } : {}),
        reply_to: contactAddress,
        subject: `Facebook Shop estimated invoice — ${reference}`,
        text: shopOrderText(order, reference, date),
        attachments: [{ content: bytesToBase64(pdf), filename: 'dura-fence-shop-estimated-invoice.pdf', content_type: 'application/pdf' }],
      }),
    });
    if (!response.ok) {
      console.error(JSON.stringify({ event: 'shop_checkout_email_failed', reference, status: response.status }));
      const status = response.status === 429 ? 429 : [401, 403].includes(response.status) ? 503 : 502;
      return fail(status, 'email_failed', 'The email was not sent. Please try again later or contact the business.');
    }
    const sent = await response.json() as { id?: string };
    if (!sent.id) throw new Error('Missing message ID');
    console.log(JSON.stringify({ event: 'shop_checkout_email_sent', reference, messageId: sent.id }));
    return json({ ok: true, message: 'Your estimated invoice has been emailed. A copy went to Dura Fence Metal.', reference });
  } catch {
    console.error(JSON.stringify({ event: 'shop_checkout_email_failed', reference }));
    return fail(502, 'email_failed', 'Sending could not be confirmed. Check your inbox before trying again, or contact the business.');
  }
}
