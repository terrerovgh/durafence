import assert from 'node:assert/strict';
import { it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { onRequestPost } from '../../functions/api/shop-checkout.ts';
import { buildShopPdf } from './shop-checkout-pdf.ts';
import { prepareShopOrder, shopOrderText } from './shop-checkout.ts';
import worker from '../../worker/index.ts';

function body() {
  return {
    customer: { name: 'José Núñez <script>', email: 'customer@example.com', phone: '229 555 0100', street: '14 Oak Street', city: 'Valdosta', state: 'GA', zip: '31601' },
    order: { fenceSku: 'premium-installed', lengthFt: 100, gates: { ft12: 0, ft6: 1, ft3: 0 }, payByCard: false, discountCode: '' },
  };
}
const request = (payload: unknown = body()) => new Request('https://durafencemetal.com/api/shop-checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });

it('creates an opening PDF and preserves the estimate disclaimer and units', async () => {
  const prepared = prepareShopOrder(body());
  if (!prepared.ok || prepared.kind !== 'order') throw new Error('Expected order');
  const pdf = await buildShopPdf(prepared.order, 'DFM-test', 'September 30, 2026');
  assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 1);
  const text = shopOrderText(prepared.order, 'DFM-test', 'September 30, 2026');
  assert.match(text, /100 ft × \$40\.00 = \$4,000\.00/);
  assert.match(text, /1 each × \$500\.00 = \$500\.00/);
  assert.match(text, /Estimated total: \$4,500\.00/);
  assert.match(text, /subject to final measurement/);
});

it('emails every fence line with its own footage, price and combined total', async (t) => {
  const payload = { ...body(), order: { ...body().order, additionalFences: [{ sku: 'standard-installed', lengthFt: 50 }] } };
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const message = JSON.parse(options.body);
    assert.match(message.text, /Premium Privacy Fence Installed: 100 ft × \$40\.00 = \$4,000\.00/);
    assert.match(message.text, /Standard Privacy Fence Installed: 50 ft × \$35\.00 = \$1,750\.00/);
    assert.match(message.text, /Estimated total: \$6,250\.00/);
    assert.match(message.text, /Due with request \(25%\): \$1,562\.50/);
    const doc = await PDFDocument.load(Buffer.from(message.attachments[0].content, 'base64'));
    assert.ok(doc.getPageCount() >= 1);
    return Response.json({ id: 'multi-fence-test' });
  });
  assert.equal((await onRequestPost({ request: request(payload), env: { RESEND_API_KEY: 'test' } })).status, 200);
});

for (const secret of ['RESEND_API_KEY', 'RESENT_API_KEY']) {
  it(`emails a recomputed PDF to the customer and info address using ${secret}`, async (t) => {
    const sent: Record<string, any>[] = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(options.headers.authorization, 'Bearer test-key');
      sent.push(JSON.parse(options.body));
      return Response.json({ id: 'test-message' });
    });
    const response = await worker.fetch(request({ ...body(), totalCents: 1 }), { ASSETS: { fetch: async () => { throw new Error('Unexpected assets'); } }, [secret]: 'test-key' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'customer@example.com');
    assert.deepEqual(sent[0].bcc, ['info@durafencemetal.com']);
    assert.equal(sent[0].reply_to, 'info@durafencemetal.com');
    assert.equal(sent[0].from, 'Dura Fence Metal <invoice@durafencemetal.com>');
    assert.match(sent[0].text, /Estimated total: \$4,500\.00/);
    await PDFDocument.load(Buffer.from(sent[0].attachments[0].content, 'base64'));
  });
}

for (const [providerStatus, expected] of [[401, 503], [403, 503], [429, 429], [500, 502]]) {
  it(`does not report success for provider status ${providerStatus}`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'private detail' }, { status: providerStatus }));
    const response = await onRequestPost({ request: request(), env: { RESEND_API_KEY: 'test' } });
    assert.equal(response.status, expected);
    const text = await response.text();
    assert.match(text, /"ok":false/);
    assert.doesNotMatch(text, /private detail/);
  });
}

it('preserves failure states for network errors and missing message IDs', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('network failure'); });
  assert.equal((await onRequestPost({ request: request(), env: { RESEND_API_KEY: 'test' } })).status, 502);
  mock.mock.mockImplementation(async () => Response.json({}));
  assert.equal((await onRequestPost({ request: request(), env: { RESEND_API_KEY: 'test' } })).status, 502);
});

it('rejects missing configuration, invalid data and oversized input without sending', async (t) => {
  const send = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected send'); });
  assert.equal((await onRequestPost({ request: request(), env: {} })).status, 503);
  const invalid = body(); invalid.customer.email = 'invalid';
  assert.equal((await onRequestPost({ request: request(invalid), env: { RESEND_API_KEY: 'test' } })).status, 400);
  assert.equal((await onRequestPost({ request: request('x'.repeat(20001)), env: {} })).status, 413);
  assert.equal((await onRequestPost({ request: request({ df_leave_blank: 'spam' }), env: {} })).status, 200);
  assert.equal(send.mock.callCount(), 0);
});

it('logs the complete arrival query and preserves it through redirects', async (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const assets = { fetch: async () => new Response('Checkout') };
  const query = '?item=premium-installed&coupon=DURA10&extra=a%2Bb&extra=c';
  const response = await worker.fetch(new Request(`https://durafencemetal.com/shop-checkout/${query}`), { ASSETS: assets });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(log.mock.calls[0].arguments[0]), { event: 'shop_checkout_arrival', query });
  const redirected = await worker.fetch(new Request(`https://www.durafencemetal.com/shop-checkout${query}`), { ASSETS: assets });
  assert.equal(redirected.headers.get('location'), `https://durafencemetal.com/shop-checkout/${query}`);
  assert.equal((await worker.fetch(new Request('https://durafencemetal.com/api/shop-checkout'), { ASSETS: assets })).status, 405);
  const insecure = await worker.fetch(new Request(`http://durafencemetal.com/shop-checkout/${query}`), { ASSETS: assets });
  assert.equal(insecure.status, 308);
  assert.equal(insecure.headers.get('location'), `https://durafencemetal.com/shop-checkout/${query}`);
});

it('limits a network to 30 sends an hour', async (t) => {
  const entries = new Map<string, Response>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: { match: async (key: Request) => entries.get(key.url)?.clone(), put: async (key: Request, value: Response) => { entries.set(key.url, value); } } } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'caches', previous); else Reflect.deleteProperty(globalThis, 'caches'); });
  const send = t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'test-message' }));
  for (let index = 0; index < 30; index++) assert.equal((await onRequestPost({ request: request(), env: { RESEND_API_KEY: 'test' } })).status, 200);
  assert.equal((await onRequestPost({ request: request(), env: { RESEND_API_KEY: 'test' } })).status, 429);
  assert.equal(send.mock.callCount(), 30);
});
