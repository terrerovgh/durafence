import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createShopCommerceTracker } from './meta-commerce.ts';
import type { ShopOrderInput } from '../data/shop-checkout.ts';

const cart = (overrides: Partial<ShopOrderInput> = {}): ShopOrderInput => ({
  fenceSku: 'premium-materials', lengthFt: 5, gates: { ft12: 0, ft6: 0, ft3: 1 },
  payByCard: false, discountCode: 'DURA10', ...overrides,
});
function tracker() {
  const events: { name: string; data: unknown }[] = [];
  return { events, track: createShopCommerceTracker((name, data) => events.push({ name, data })) };
}

test('Meta selection displays catalog products and only a confirmed estimate becomes a lead', () => {
  const { events, track } = tracker();
  track.observe(cart());
  assert.deepEqual(events.map(e => e.name), ['ViewContent']);
  track.lead(cart());
  assert.deepEqual(events.map(e => e.name), ['ViewContent', 'Lead']);
  assert.deepEqual(events[1].data, {
    content_ids: ['premium-materials', 'gate-3ft-extra'], content_type: 'product',
    contents: [{ id: 'premium-materials', quantity: 5, item_price: 25 }, { id: 'gate-3ft-extra', quantity: 1, item_price: 250 }],
    value: 337.5, currency: 'USD', num_items: 6,
  });
});

test('editing an estimate never sends cart, checkout or purchase events', () => {
  const { events, track } = tracker();
  track.observe(cart());
  track.observe(cart());
  track.observe(cart({ discountCode: '', payByCard: true }));
  track.observe(cart({ lengthFt: 5.25 }));
  track.observe(cart({ lengthFt: 4 }));
  assert.deepEqual(events.map(e => e.name), ['ViewContent']);
});

test('legacy Meta object IDs normalize to retailer IDs and unknown products send nothing', () => {
  const { events, track } = tracker();
  track.view(['28792457657072905', 'premium-materials', 'unknown']);
  track.view(['premium-materials']);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data, {
    content_ids: ['premium-materials'], content_type: 'product',
    contents: [{ id: 'premium-materials', quantity: 1, item_price: 25 }],
    value: 25, currency: 'USD', num_items: 1,
  });
});

test('invalid quantities and discount codes cannot generate cart conversions', () => {
  const { events, track } = tracker();
  track.observe(cart({ lengthFt: -1 }));
  track.observe(cart({ gates: { ft12: 0, ft6: 0, ft3: 0.5 } }));
  track.observe(cart({ discountCode: 'invalid' }));
  assert.deepEqual(events, []);
});

test('all seven products and estimated card tax are included in the confirmed lead', () => {
  const { events, track } = tracker();
  track.lead(cart({ fenceSku: 'premium-installed', lengthFt: 2,
    additionalFences: [{ sku: 'premium-materials', lengthFt: 2 }, { sku: 'standard-installed', lengthFt: 2 }, { sku: 'standard-materials', lengthFt: 2 }],
    gates: { ft12: 2, ft6: 2, ft3: 2 }, payByCard: true, discountCode: '',
  }));
  const data = events.find(e => e.name === 'Lead')!.data as { content_ids: string[]; value: number };
  assert.equal(data.content_ids.length, 7);
  assert.equal(data.value, 4001.8);
});

test('removing and restoring an estimate product cannot duplicate its view', () => {
  const { events, track } = tracker();
  track.observe(cart({ fenceSku: '', lengthFt: 0, discountCode: '' }));
  track.observe(cart({ fenceSku: '', lengthFt: 0, gates: { ft12: 0, ft6: 0, ft3: 0 }, discountCode: '' }));
  track.observe(cart({ fenceSku: '', lengthFt: 0, discountCode: '' }));
  assert.deepEqual(events.map(e => e.name), ['ViewContent']);
});

test('confirmed estimate leads carry only catalog data, never a Purchase event', () => {
  const { events, track } = tracker();
  track.lead(cart());
  track.lead(cart({ lengthFt: -1 }));
  assert.deepEqual(events.map(e => e.name), ['Lead']);
  assert.deepEqual(Object.keys(events[0].data as object).sort(), ['content_ids', 'content_type', 'contents', 'currency', 'num_items', 'value']);
});

test('the real pixel component forwards commerce events only to the configured pixel', () => {
  const source = readFileSync(new URL('../components/MetaPixel.astro', import.meta.url), 'utf8');
  const script = source.match(/<script is:inline[^>]*>([\s\S]*?)<\/script>/)![1];
  const document = new EventTarget();
  const calls: unknown[][] = [];
  const fbq = (...args: unknown[]) => calls.push(args);
  vm.runInNewContext(script, { window: { fbq }, document, fbq, pixelId: '1991001054903517' });
  const track = createShopCommerceTracker((name, data) => document.dispatchEvent(new CustomEvent('dura-fence:commerce', { detail: { name, data } })));
  track.observe(cart());
  track.observe(cart({ lengthFt: 6 }));
  track.lead(cart());
  const beforeInvalid = calls.length;
  for (const name of ['AddToCart', 'InitiateCheckout', 'Purchase']) {
    document.dispatchEvent(new CustomEvent('dura-fence:commerce', { detail: { name, data: {} } }));
  }
  assert.equal(calls.length, beforeInvalid);
  assert.deepEqual(calls.slice(2).map(call => call.slice(0, 3)), [
    ['trackSingle', '1991001054903517', 'ViewContent'],
    ['trackSingle', '1991001054903517', 'Lead'],
  ]);
});
