// POST /api/estimate-email
// Sends the priced estimate PDF from invoice@durafencemetal.com.
// The customer is the recipient. The shop addresses always receive a copy.

import { buildEstimatePdf, bytesToBase64, estimatePdfName } from '../../src/data/estimate-pdf.ts';
import {
  draftEstimateEmail,
  formatSentOn,
  invoiceAddress,
  prepareEstimateLetter,
} from '../../src/data/estimate-mail.ts';
import { PdfLayoutOverflowError } from '../../src/pdf/layout-error.ts';
import { validateUsAddress } from '../../src/data/us-address.ts';

export const estimateCopies = ['abelterreros@yahoo.com', 'allneedsdiscount1@gmail.com'] as const;

export interface EstimateEmailEnv {
  RESEND_API_KEY?: string;
  // Compatibility with the name already configured in Cloudflare.
  RESENT_API_KEY?: string;
}

const hourLimit = 30;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function fail(status: number, error: string, message: string, fields?: Record<string, string>): Response {
  return json({ ok: false, error, message, fields }, status);
}

function copiesFor(to: string): string[] {
  const target = to.toLowerCase();
  return estimateCopies.filter((address) => address.toLowerCase() !== target);
}

async function overLimit(request: Request): Promise<boolean> {
  try {
    const cache = globalThis.caches?.default;
    if (!cache) return false;
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const hour = Math.floor(Date.now() / 3_600_000);
    const key = new Request(`https://durafencemetal.com/__estimate-email-limit/${hour}/${encodeURIComponent(ip)}`);
    const hit = await cache.match(key);
    const count = hit ? Number(await hit.text()) : 0;
    if (count >= hourLimit) return true;
    await cache.put(
      key,
      new Response(String(count + 1), { headers: { 'cache-control': 'public, max-age=3600' } }),
    );
    return false;
  } catch {
    console.error(JSON.stringify({ event: 'estimate_email_limit_failed' }));
    return false;
  }
}

export async function onRequestPost(context: { request: Request; env: EstimateEmailEnv; validateAddress?: typeof validateUsAddress }): Promise<Response> {
  const { request, env } = context;
  const raw = await request.text();
  if (raw.length > 20_000) return fail(413, 'too_large', 'That request is too long.');

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return fail(400, 'invalid', 'The estimate could not be read.');
  }

  const prepared = prepareEstimateLetter(payload, formatSentOn(new Date()));
  if (!prepared.ok) return fail(prepared.status, prepared.error, prepared.message, prepared.fields);
  if (prepared.kind === 'honeypot') return json({ ok: true });
  const apiKey = env.RESEND_API_KEY?.trim() || env.RESENT_API_KEY?.trim();
  if (!apiKey) return fail(503, 'not_configured', 'Email is not set up on this server yet.');
  const { letter } = prepared;
  let pdf: Uint8Array;
  try {
    pdf = await buildEstimatePdf(letter);
  } catch (error) {
    if (error instanceof PdfLayoutOverflowError) return fail(422, 'pdf_layout_overflow', error.message);
    console.error(JSON.stringify({ event: 'estimate_pdf_failed' }));
    return fail(500, 'pdf_failed', 'The estimate PDF could not be built.');
  }

  const address = await (context.validateAddress ?? validateUsAddress)(letter.customer.address);
  if (address.kind === 'invalid') {
    return fail(400, 'invalid_address', 'Check the project address.', {
      'customer-address': 'Enter a complete US street address with city and state that can be matched.',
    });
  }
  if (address.kind === 'unavailable') {
    return fail(503, 'address_unavailable', 'Address verification is temporarily unavailable. Please try again.');
  }
  // Only a readable, complete PDF can consume an email attempt.
  if (await overLimit(request)) {
    return fail(429, 'rate_limited', 'Too many estimates were sent from this network. Wait an hour and try again.');
  }
  const draft = draftEstimateEmail(letter);

  const copies = copiesFor(letter.customer.email);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: letter.customer.email,
        ...(copies.length > 0 ? { bcc: copies } : {}),
        from: `Dura Fence Metal <${invoiceAddress}>`,
        reply_to: invoiceAddress,
        subject: draft.subject,
        html: draft.html,
        text: draft.text,
        attachments: [
          {
            content: bytesToBase64(pdf),
            filename: estimatePdfName,
            content_type: 'application/pdf',
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error(JSON.stringify({ event: 'estimate_email_failed', provider: 'resend', status: response.status }));
      if (response.status === 429) {
        return fail(429, 'rate_limited', 'Email sending is temporarily limited. Please try again later.');
      }
      if (response.status === 401 || response.status === 403) {
        return fail(503, 'not_configured', 'Email sending is not configured correctly. Please contact the shop.');
      }
      return fail(502, 'email_failed', 'The estimate was not sent. Try again in a minute.');
    }
    const sent = await response.json() as { id?: string };
    if (!sent.id) throw new Error('Missing Resend message ID');
    console.log(JSON.stringify({ event: 'estimate_email', provider: 'resend', messageId: sent.id }));
  } catch {
    console.error(JSON.stringify({ event: 'estimate_email_failed', provider: 'resend' }));
    return fail(502, 'email_failed', 'The estimate was not sent. Try again in a minute.');
  }

  return json({ ok: true, message: `Sent to ${letter.customer.email}. A copy went to the shop.` });
}
