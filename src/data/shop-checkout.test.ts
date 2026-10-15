import assert from 'node:assert/strict';
import { it } from 'node:test';
import { checkoutCatalog, resolveShopItem, priceShopOrder, prepareShopOrder, readShopCheckoutQuery } from './shop-checkout.ts';

it('imports the actual Meta cart as linear feet plus gate quantities and coupon', () => {
  const imported = readShopCheckoutQuery(new URLSearchParams('products=premium-materials:5,gate-3ft-extra:1&coupon=DURA10'));
  assert.equal(imported.product, 'premium-materials');
  assert.equal(imported.lengthFt, 5);
  assert.deepEqual(imported.gates, { ft12: 0, ft6: 0, ft3: 1 });
  assert.equal(imported.discountCode, 'DURA10');
  assert.equal(imported.importError, '');
  const result = priceShopOrder({ ...orderBody().order, fenceSku: imported.product, lengthFt: imported.lengthFt ?? 0, gates: imported.gates, discountCode: '' });
  assert.equal(result.subtotalCents, 37500);
});

it('imports gates-only carts, decimal feet, repeated products and Meta IDs', () => {
  const gates = readShopCheckoutQuery(new URLSearchParams('products=gate-12ft-extra:2,gate-6ft-extra:3,gate-3ft-extra:4'));
  assert.equal(gates.product, 'gates-only');
  assert.deepEqual(gates.gates, { ft12: 2, ft6: 3, ft3: 4 });
  const repeated = readShopCheckoutQuery(new URLSearchParams('products=premium-installed:0.1,29302961342630227:0.2&products=gate-3ft-extra:1,39008238068791369:2'));
  assert.equal(repeated.lengthFt, 0.3);
  assert.equal(repeated.gates.ft3, 3);
  assert.equal(repeated.importError, '');
});

it('prioritizes products over item and preserves legacy item and coupon behavior', () => {
  const both = readShopCheckoutQuery(new URLSearchParams('products=standard-materials:12.25,gate-6ft-extra:2&item=premium-installed'));
  assert.equal(both.product, 'standard-materials');
  assert.equal(both.lengthFt, 12.25);
  const legacy = readShopCheckoutQuery(new URLSearchParams('item=gate-3ft-extra&coupon_code=ABE10'));
  assert.equal(legacy.product, 'gate-3ft-extra');
  assert.equal(legacy.gates.ft3, 1);
  assert.equal(legacy.discountCode, 'ABE10');
  assert.equal(readShopCheckoutQuery(new URLSearchParams()).product, '');
});

it('imports every fence package as a separate priced line alongside gates', () => {
  const imported = readShopCheckoutQuery(new URLSearchParams('products=standard-installed:10,premium-installed:20,gate-3ft-extra:2,standard-installed:5,gate-6ft-extra:1&coupon=DURA10'));
  assert.equal(imported.product, 'standard-installed');
  assert.equal(imported.lengthFt, 15);
  assert.deepEqual(imported.gates, { ft12: 0, ft6: 1, ft3: 2 });
  assert.equal(imported.discountCode, 'DURA10');
  assert.equal(imported.importError, '');
  assert.deepEqual(imported.additionalFences, [{ sku: 'premium-installed', lengthFt: 20 }]);
  const result = priceShopOrder({ ...orderBody().order, fenceSku: imported.product, lengthFt: imported.lengthFt ?? 0, additionalFences: imported.additionalFences, gates: imported.gates, discountCode: '' });
  assert.equal(result.subtotalCents, 232500);
  assert.equal(result.lines.length, 4);
  const reversed = readShopCheckoutQuery(new URLSearchParams('products=premium-installed:20,standard-installed:10'));
  assert.equal(reversed.product, 'premium-installed');
  assert.equal(reversed.lengthFt, 20);
  assert.deepEqual(reversed.additionalFences, [{ sku: 'standard-installed', lengthFt: 10 }]);
});

it('represents all seven catalog products and validates every additional fence on the server', () => {
  const imported = readShopCheckoutQuery(new URLSearchParams({ products: checkoutCatalog.map(item => `${item.sku}:2`).join(',') }));
  assert.equal(imported.importError, '');
  assert.equal(imported.additionalFences.length, 3);
  const input = { ...orderBody().order, fenceSku: imported.product, lengthFt: imported.lengthFt ?? 0, additionalFences: imported.additionalFences, gates: imported.gates };
  const result = priceShopOrder(input);
  assert.equal(result.lines.length, 7);
  assert.equal(result.subtotalCents, 374000);
  for (const additionalFences of [
    [{ sku: 'standard-installed', lengthFt: -1 }],
    [{ sku: 'standard-installed', lengthFt: 5001 }],
    [{ sku: 'standard-installed', lengthFt: 0.001 }],
    [{ sku: 'premium-installed', lengthFt: 10 }],
    [{ sku: 'gate-3ft-extra', lengthFt: 10 }],
    [{ sku: 'unknown', lengthFt: 10 }],
  ]) assert.equal(prepareShopOrder({ ...orderBody(), order: { ...orderBody().order, additionalFences } }).ok, false);
  assert.equal(prepareShopOrder({ ...orderBody(), order: { ...orderBody().order, additionalFences: 'invalid' } }).ok, false);
});

it('shows manual recovery for invalid Meta carts without silently importing part of them', () => {
  for (const products of ['', 'unknown:1', 'premium-materials', 'premium-materials:0', 'premium-materials:-1', 'premium-materials:5001', 'premium-materials:1e2', 'premium-materials:1.001', 'gate-3ft-extra:0.5', 'gate-3ft-extra:99,gate-3ft-extra:1', 'premium-materials:5,unknown:1']) {
    const imported = readShopCheckoutQuery(new URLSearchParams({ products, item: 'premium-installed' }));
    assert.ok(imported.importError, products);
    assert.equal(imported.product, '');
    assert.deepEqual(imported.gates, { ft12: 0, ft6: 0, ft3: 0 });
  }
});

export function orderBody() {
  return {
    customer: { name: 'José Núñez', email: 'jose@example.com', phone: '229 555 0100', street: '14 Oak Street', city: 'Valdosta', state: 'GA', zip: '31601' },
    order: { fenceSku: 'premium-installed', lengthFt: 100, gates: { ft12: 0, ft6: 1, ft3: 0 }, payByCard: false, discountCode: '' },
    df_leave_blank: '',
  };
}

it('resolves all seven retailer IDs and Meta IDs, with safe fallback', () => {
  assert.equal(checkoutCatalog.length, 7);
  for (const item of checkoutCatalog) {
    assert.equal(resolveShopItem(item.sku)?.sku, item.sku);
    assert.equal(resolveShopItem(item.metaId)?.sku, item.sku);
  }
  for (const value of [null, '', 'unknown', '<script>']) assert.equal(resolveShopItem(value), undefined);
});

it('prices every catalog product and uses current discount, card and deposit rules', () => {
  for (const item of checkoutCatalog) {
    const order = { ...orderBody().order, fenceSku: item.kind === 'fence' ? item.sku : '', lengthFt: item.kind === 'fence' ? 10.25 : 0, gates: { ft12: 0, ft6: 0, ft3: 0 } };
    if (item.kind === 'gate') order.gates[item.gateId] = 2;
    const result = priceShopOrder(order);
    assert.equal(result.subtotalCents, item.unitCents * (item.kind === 'fence' ? 10.25 : 2));
  }
  const plain = priceShopOrder(orderBody().order);
  assert.equal(plain.totalCents, 450000);
  assert.equal(plain.depositCents, 112500);
  const discounted = priceShopOrder({ ...orderBody().order, payByCard: true, discountCode: 'DURA10' });
  assert.equal(discounted.discount.appliedCents, 45000);
  assert.equal(discounted.taxCents, 28350);
  assert.equal(discounted.totalCents, 433350);
  assert.equal(discounted.depositCents, 108338);
});

it('rejects invalid quantities, empty orders, coupons and customer data', () => {
  for (const lengthFt of [0, -1, 5000.01, NaN, Infinity, 0.001]) {
    assert.ok(Object.keys(priceShopOrder({ ...orderBody().order, lengthFt }).fields).length > 0);
  }
  for (const qty of [-1, 0.5, 100, NaN]) {
    assert.ok(priceShopOrder({ ...orderBody().order, gates: { ft12: qty, ft6: 0, ft3: 0 } }).fields.ft12);
  }
  assert.ok(priceShopOrder({ ...orderBody().order, fenceSku: '', lengthFt: 0, gates: { ft12: 0, ft6: 0, ft3: 0 } }).fields.product);
  assert.ok(priceShopOrder({ ...orderBody().order, discountCode: 'unknown' }).fields.discountCode);
  const body = orderBody();
  body.customer.zip = '';
  assert.equal(prepareShopOrder(body).ok, false);
  body.customer.zip = '31601';
  body.customer.email = 'invalid';
  assert.equal(prepareShopOrder(body).ok, false);
});

it('recomputes prices and handles honeypots', () => {
  const prepared = prepareShopOrder({ ...orderBody(), totalCents: 1 });
  assert.equal(prepared.ok, true);
  if (prepared.ok && prepared.kind === 'order') assert.equal(prepared.order.result.totalCents, 450000);
  assert.deepEqual(prepareShopOrder({ df_leave_blank: 'spam' }), { ok: true, kind: 'honeypot' });
});
