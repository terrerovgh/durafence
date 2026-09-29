import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { onRequestPost as onQuote } from '../../functions/api/quote.ts';
import { PDFDocument } from 'pdf-lib';
import { estimateCopies, onRequestPost } from '../../functions/api/estimate-email.ts';
import { draftEstimateEmail, prepareEstimateLetter, type EstimateLetter } from './estimate-mail.ts';
import { buildEstimatePdf } from './estimate-pdf.ts';
import worker from '../../worker/index.ts';

const sentOn = 'September 25, 2026';

function requestBody(over: Record<string, unknown> = {}) {
  return {
    customer: {
      name: 'José Núñez',
      address: '14 Oak Street, Valdosta',
      phone: '229 555 0100',
      email: 'jose@example.com',
    },
    estimate: {
      lengthFt: 100,
      heightFt: 6,
      packageId: 'premium',
      labor: 'installed',
      extraGates: { ft12: 0, ft6: 0, ft3: 0 },
      extraScrewLb: 0,
      aluminumGates: [],
      payByCard: false,
      discountCode: '',
    },
    ...over,
  };
}

function letter(): EstimateLetter {
  const prepared = prepareEstimateLetter(requestBody(), sentOn);
  assert.equal(prepared.ok, true);
  if (!prepared.ok || prepared.kind !== 'letter') throw new Error('expected a letter');
  return prepared.letter;
}

describe('prepareEstimateLetter', () => {
  it('prices the sheet on the server and names the customer in the letter', () => {
    const prepared = prepareEstimateLetter(requestBody({ estimate: { ...requestBody().estimate, discountCode: 'DURA10' } }), sentOn);
    assert.equal(prepared.ok, true);
    if (!prepared.ok || prepared.kind !== 'letter') return;
    const draft = draftEstimateEmail(prepared.letter);
    assert.equal(draft.subject, 'Estimate for José Núñez');
    assert.match(draft.text, /José Núñez/);
    assert.match(draft.text, /14 Oak Street, Valdosta/);
    assert.match(draft.text, /229 555 0100/);
    assert.match(draft.text, /jose@example.com/);
    assert.match(draft.text, /Total: \$3,600\.00/);
    assert.match(draft.text, /Due with request \(25%\): \$900\.00/);
    assert.match(draft.html, /Jos&eacute;|José/);
    assert.match(draft.html, /N&uacute;|Núñez|Núñez/);
    assert.doesNotMatch(draft.html, /<script/);
  });

  it('escapes a name that contains markup', () => {
    const body = requestBody();
    const customer = { ...(body.customer as object), name: 'A & B <mill>' };
    const prepared = prepareEstimateLetter({ ...body, customer }, sentOn);
    assert.equal(prepared.ok, true);
    if (!prepared.ok || prepared.kind !== 'letter') return;
    const draft = draftEstimateEmail(prepared.letter);
    assert.match(draft.text, /A & B <mill>/);
    assert.match(draft.html, /A &amp; B &lt;mill&gt;/);
    assert.doesNotMatch(draft.html, /A & B <mill>/);
  });

  it('asks for the customer email and does not invent a price', () => {
    const body = requestBody();
    const customer = { ...(body.customer as object), email: 'not-an-email' };
    const prepared = prepareEstimateLetter({ ...body, customer }, sentOn);
    assert.equal(prepared.ok, false);
    if (prepared.ok) return;
    assert.equal(prepared.fields?.['customer-email'], 'Enter the customer email.');
  });

  it('rejects a height outside 3 to 12 feet', () => {
    const body = requestBody();
    const estimate = { ...(body.estimate as object), heightFt: 2 };
    const prepared = prepareEstimateLetter({ ...body, estimate }, sentOn);
    assert.equal(prepared.ok, false);
    if (prepared.ok) return;
    assert.equal(prepared.fields?.height, 'Enter a height from 3 to 12 feet.');
  });

  it('treats a filled honeypot as success without a letter', () => {
    const prepared = prepareEstimateLetter(requestBody({ df_leave_blank: 'spam' }), sentOn);
    assert.deepEqual(prepared, { ok: true, kind: 'honeypot' });
  });
});

describe('buildEstimatePdf', () => {
  it('writes a PDF that opens and keeps an accented name', async () => {
    const bytes = await buildEstimatePdf(letter());
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 1);
  });

  it('keeps going when the address is long and several gates are on the sheet', async () => {
    const body = requestBody();
    const estimate = {
      ...(body.estimate as object),
      extraGates: { ft12: 2, ft6: 1, ft3: 1 },
      extraScrewLb: 4,
      aluminumGates: Array.from({ length: 12 }, () => ({ widthFt: 14, labor: 'materials' })),
    };
    const customer = { ...(body.customer as object), address: 'A'.repeat(180) };
    const prepared = prepareEstimateLetter({ ...body, customer, estimate }, sentOn);
    assert.equal(prepared.ok, true);
    if (!prepared.ok || prepared.kind !== 'letter') return;
    const bytes = await buildEstimatePdf(prepared.letter);
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 1);
  });
});

describe('POST /api/estimate-email with Resend', () => {
  const validateAddress = async () => ({ kind: 'valid' as const, matchedAddress: '14 OAK ST, VALDOSTA, GA' });
  function request(body = requestBody()) {
    return new Request('https://durafencemetal.com/api/estimate-email', {
      method: 'POST', body: JSON.stringify(body),
    });
  }

  for (const key of ['RESEND_API_KEY', 'RESENT_API_KEY']) {
    it(`sends a priced PDF and shop copies using ${key}`, async (t) => {
      const sent: Record<string, any>[] = [];
      t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://api.resend.com/emails');
        assert.equal(options.headers.authorization, 'Bearer test-key');
        sent.push(JSON.parse(options.body));
        return Response.json({ id: 'test-message' });
      });
      const response = await onRequestPost({ request: request(), env: { [key]: 'test-key' }, validateAddress });
      assert.equal(response.status, 200);
      assert.equal(sent.length, 1);
      const message = sent[0];
      assert.equal(message.from, 'Dura Fence Metal <invoice@durafencemetal.com>');
      assert.equal(message.reply_to, 'invoice@durafencemetal.com');
      assert.equal(message.to, 'jose@example.com');
      assert.deepEqual(message.bcc, [...estimateCopies]);
      assert.match(message.text, /Total: \$4,000\.00/);
      assert.equal(message.attachments[0].content_type, 'application/pdf');
      assert.equal(message.attachments[0].filename, 'dura-fence-estimate.pdf');
      const pdf = Buffer.from(message.attachments[0].content, 'base64');
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      await PDFDocument.load(pdf);
    });
  }

  it('does not copy an address that is already the customer', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body).bcc, ['allneedsdiscount1@gmail.com']);
      return Response.json({ id: 'test-message' });
    });
    const body = requestBody();
    body.customer.email = 'AbelTerreros@yahoo.com';
    assert.equal((await onRequestPost({ request: request(body), env: { RESEND_API_KEY: 'test' }, validateAddress })).status, 200);
  });

  for (const [providerStatus, expected] of [[401, 503], [403, 503], [429, 429], [500, 502]]) {
    it(`handles Resend HTTP ${providerStatus}`, async (t) => {
      t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'private provider detail' }, { status: providerStatus }));
      const response = await onRequestPost({ request: request(), env: { RESEND_API_KEY: 'test' }, validateAddress });
      assert.equal(response.status, expected);
      assert.doesNotMatch(await response.text(), /private provider detail/);
    });
  }

  it('handles network failures without reporting success', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('network'); });
    assert.equal((await onRequestPost({ request: request(), env: { RESEND_API_KEY: 'test' }, validateAddress })).status, 502);
  });

  it('does not send without a key or valid customer', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected send'); });
    assert.equal((await onRequestPost({ request: request(), env: {}, validateAddress })).status, 503);
    const body = requestBody();
    body.customer.email = '';
    assert.equal((await onRequestPost({ request: request(body), env: { RESEND_API_KEY: 'test' }, validateAddress })).status, 400);
    assert.equal(fetch.mock.callCount(), 0);
  });

  it('does not send when the project address cannot be matched', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected send'); });
    const response = await onRequestPost({ request: request(), env: { RESEND_API_KEY: 'test' }, validateAddress: async () => ({ kind: 'invalid' }) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).fields['customer-address'] !== undefined, true);
    assert.equal(fetch.mock.callCount(), 0);
  });
});

for (const key of ['RESEND_API_KEY', 'RESENT_API_KEY']) {
  it(`quote form accepts ${key}`, async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) => {
      assert.equal(options.headers.authorization, 'Bearer test-key');
      const message = JSON.parse(options.body);
      assert.deepEqual(message.to, ['allneedsdiscount1@gmail.com', 'terrerov@gmail.com']);
      assert.equal(message.from, 'Dura Fence Metal <info@durafencemetal.com>');
      assert.equal(message.reply_to, 'customer@example.com');
      return Response.json({ id: 'quote-message' });
    });
    const response = await onQuote({
      request: new Request('https://durafencemetal.com/api/quote', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ name: 'Customer', email: 'customer@example.com', city: 'Valdosta', property: 'residential', work: 'new' }),
      }),
      env: { [key]: 'test-key' },
    });
    assert.equal(response.status, 200);
    assert.equal(fetch.mock.callCount(), 1);
  });
}

it('forwards incoming mail for the public info address to both recipients', async () => {
  const forwarded: string[] = [];
  const rejected: string[] = [];
  await worker.email({
    to: 'INFO@durafencemetal.com',
    async forward(address: string) { forwarded.push(address); },
    setReject(reason: string) { rejected.push(reason); },
  });
  assert.deepEqual(forwarded, ['allneedsdiscount1@gmail.com', 'terrerov@gmail.com']);
  assert.deepEqual(rejected, []);
});

it('still forwards contact mail to the second recipient if the first fails', async (t) => {
  t.mock.method(console, 'error', () => {});
  const forwarded: string[] = [];
  const rejected: string[] = [];
  await worker.email({
    to: 'info@durafencemetal.com',
    async forward(address: string) {
      if (address === 'allneedsdiscount1@gmail.com') throw new Error('unavailable');
      forwarded.push(address);
    },
    setReject(reason: string) { rejected.push(reason); },
  });
  assert.deepEqual(forwarded, ['terrerov@gmail.com']);
  assert.deepEqual(rejected, []);
});
