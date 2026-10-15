import { applyDiscount, cardTaxCents, depositCents, extraGateCatalog, fencePackages, formatReceiptMoney, maxGateQty, maxLengthFt, type ExtraGateId } from './estimate.ts';

type FenceProduct = { kind: 'fence'; sku: string; metaId: string; name: string; unitCents: number; packageId: 'premium' | 'standard'; labor: 'installed' | 'materials' };
type GateProduct = { kind: 'gate'; sku: string; metaId: string; name: string; unitCents: number; gateId: ExtraGateId };
export const checkoutCatalog: (FenceProduct | GateProduct)[] = [
  { kind: 'fence', sku: 'premium-installed', metaId: '29302961342630227', name: 'Premium Privacy Fence Installed', unitCents: fencePackages.premium.installed * 100, packageId: 'premium', labor: 'installed' },
  { kind: 'fence', sku: 'premium-materials', metaId: '28792457657072905', name: 'Premium Privacy Fence Materials Only', unitCents: fencePackages.premium.materials * 100, packageId: 'premium', labor: 'materials' },
  { kind: 'fence', sku: 'standard-installed', metaId: '38841924535452860', name: 'Standard Privacy Fence Installed', unitCents: fencePackages.standard.installed * 100, packageId: 'standard', labor: 'installed' },
  { kind: 'fence', sku: 'standard-materials', metaId: '38691567220488197', name: 'Standard Privacy Fence Materials Only', unitCents: fencePackages.standard.materials * 100, packageId: 'standard', labor: 'materials' },
  ...extraGateCatalog.map((gate, index): GateProduct => ({ kind: 'gate', sku: `gate-${gate.widthFt}ft-extra`, metaId: ['28495723966746483', '28496572060001535', '39008238068791369'][index], name: `Extra ${gate.widthFt} ft Gate`, unitCents: gate.price * 100, gateId: gate.id })),
];

export function resolveShopItem(value: string | null) {
  return checkoutCatalog.find((item) => item.sku === value || item.metaId === value);
}

/** Meta sends SKU:quantity pairs; fence quantities represent linear feet. */
export function readShopCheckoutQuery(query: URLSearchParams) {
  const initial = {
    product: '', lengthFt: undefined as number | undefined,
    additionalFences: [] as ShopFenceInput[],
    gates: { ft12: 0, ft6: 0, ft3: 0 },
    discountCode: query.get('coupon') ?? query.get('coupon_code') ?? '',
    importError: '',
  };
  if (!query.has('products')) {
    const item = resolveShopItem(query.get('item'));
    initial.product = item?.sku ?? '';
    if (item?.kind === 'gate') initial.gates[item.gateId] = 1;
    return initial;
  }

  const quantities = new Map<string, number>();
  for (const entry of query.getAll('products').join(',').split(',')) {
    const pair = entry.trim().split(':');
    const item = resolveShopItem(pair[0]?.trim());
    const rawQuantity = pair[1]?.trim() ?? '';
    if (pair.length !== 2 || !item || !/^\d+(\.\d{1,2})?$/.test(rawQuantity) || Number(rawQuantity) <= 0) {
      return { ...initial, importError: 'We could not import this Facebook cart. Please choose your products and quantities below before submitting.' };
    }
    // Sum hundredths to avoid floating-point errors for repeated decimal feet.
    quantities.set(item.sku, (quantities.get(item.sku) ?? 0) + Math.round(Number(rawQuantity) * 100));
  }
  // Map insertion order preserves Meta's cart order, independent of catalog order.
  const fences = [...quantities.keys()].map(resolveShopItem).filter((item): item is FenceProduct => item?.kind === 'fence');
  const gates = { ft12: 0, ft6: 0, ft3: 0 };
  for (const item of checkoutCatalog) {
    if (item.kind === 'gate') gates[item.gateId] = (quantities.get(item.sku) ?? 0) / 100;
  }
  const fence = fences[0];
  const lengthFt = fence ? quantities.get(fence.sku)! / 100 : 0;
  const additionalFences = fences.slice(1).map(item => ({ sku: item.sku, lengthFt: quantities.get(item.sku)! / 100 }));
  const priced = priceShopOrder({ fenceSku: fence?.sku ?? '', lengthFt, additionalFences, gates, payByCard: false, discountCode: '' });
  if (Object.keys(priced.fields).length) {
    return { ...initial, importError: 'Your Facebook cart has quantities we cannot accept. Use up to 5,000 linear feet and whole gate quantities from 1 to 99. Please rebuild your order below.' };
  }
  return { ...initial, product: fence?.sku ?? 'gates-only', lengthFt, additionalFences, gates };
}

export type ShopFenceInput = { sku: string; lengthFt: number };
export type ShopOrderInput = {
  fenceSku: string;
  lengthFt: number;
  additionalFences?: ShopFenceInput[];
  gates: Record<ExtraGateId, number>;
  payByCard: boolean;
  discountCode: string;
};
export type ShopCustomer = { name: string; email: string; phone: string; street: string; city: string; state: string; zip: string };
export type ShopLine = { sku: string; name: string; quantity: number; unit: 'ft' | 'each'; unitCents: number; amountCents: number };

export function priceShopOrder(input: ShopOrderInput) {
  const fields: Record<string, string> = {};
  const lines: ShopLine[] = [];
  const pricedFences: FenceProduct[] = [];
  const seen = new Set<string>();
  const additional = input.additionalFences ?? [];
  if (additional.length > 3) fields.product = 'Use at most four different fence products.';
  const selections = [
    { sku: input.fenceSku, lengthFt: input.lengthFt, skuField: 'product', feetField: 'lengthFt' },
    ...additional.map((item, index) => ({ ...item, skuField: `additional-${index}-sku`, feetField: `additional-${index}-feet` })),
  ];
  for (const [index, selected] of selections.entries()) {
    if (index === 0 && !selected.sku && selected.lengthFt === 0) continue;
    const fence = resolveShopItem(selected.sku);
    if (fence?.kind !== 'fence') { fields[selected.skuField] = 'Choose a fence package.'; continue; }
    if (seen.has(fence.sku)) { fields[selected.skuField] = 'This product is already in your order. Update its linear feet instead.'; continue; }
    seen.add(fence.sku);
    if (!Number.isFinite(selected.lengthFt) || selected.lengthFt < 0.01 || selected.lengthFt > maxLengthFt || Math.abs(selected.lengthFt * 100 - Math.round(selected.lengthFt * 100)) > 1e-7) {
      fields[selected.feetField] = 'Enter 0.01 to 5,000 linear feet, with up to two decimal places.';
    } else {
      pricedFences.push(fence);
      lines.push({ sku: fence.sku, name: fence.name, quantity: selected.lengthFt, unit: 'ft', unitCents: fence.unitCents, amountCents: Math.round(selected.lengthFt * 100) * (fence.unitCents / 100) });
    }
  }
  for (const item of checkoutCatalog) {
    if (item.kind !== 'gate') continue;
    const quantity = input.gates[item.gateId];
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > maxGateQty) fields[item.gateId] = 'Enter a whole number from 0 to 99.';
    else if (quantity > 0) lines.push({ sku: item.sku, name: item.name, quantity, unit: 'each', unitCents: item.unitCents, amountCents: item.unitCents * quantity });
  }
  if (!lines.length && !Object.keys(fields).length) fields.product = 'Choose a fence package or add at least one gate.';
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const discount = applyDiscount(subtotalCents, input.discountCode);
  if (discount.error || input.discountCode.length > 12) fields.discountCode = discount.error || 'Shorten the discount code.';
  const netCents = subtotalCents - discount.appliedCents;
  const taxCents = cardTaxCents(netCents, input.payByCard);
  const totalCents = netCents + taxCents;
  const notes = pricedFences.length ? [
    ...pricedFences.map(fence => {
      const specs = fencePackages[fence.packageId];
      return `${fence.name}: Posts every ${specs.postSpacingFt} ft; ${specs.rails} rails; ${specs.screwsPerPicket} screws per picket.`;
    }),
    'Each fence package includes one 12 ft gate, with hinge post, latch post and closure.',
    'Each fence package includes a Ring doorbell camera. Other gates are additional openings.',
  ] : ['Gates are additional openings. No fence package is included.'];
  return { lines, fields, subtotalCents, discount, taxCents, totalCents, depositCents: depositCents(totalCents), notes };
}

export type ShopOrder = { customer: ShopCustomer; input: ShopOrderInput; result: ReturnType<typeof priceShopOrder> };
type PreparedShopOrder = { ok: true; kind: 'honeypot' } | { ok: true; kind: 'order'; order: ShopOrder } | { ok: false; fields: Record<string, string> };

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/[\r\n\t]/g, ' ') : '';
}

export function prepareShopOrder(payload: unknown): PreparedShopOrder {
  if (!record(payload)) return { ok: false, fields: { product: 'The order could not be read.' } };
  if (text(payload.df_leave_blank)) return { ok: true, kind: 'honeypot' };
  if (!record(payload.customer) || !record(payload.order) || !record(payload.order.gates)) return { ok: false, fields: { product: 'The order could not be read.' } };
  const raw = payload.order;
  const rawGates = payload.order.gates;
  const rawCustomer = payload.customer;
  if (typeof raw.fenceSku !== 'string' || typeof raw.lengthFt !== 'number' || typeof raw.payByCard !== 'boolean' || typeof raw.discountCode !== 'string') return { ok: false, fields: { product: 'The order could not be read.' } };
  const additionalFences: ShopFenceInput[] = [];
  if (raw.additionalFences !== undefined) {
    if (!Array.isArray(raw.additionalFences) || raw.additionalFences.length > 3) return { ok: false, fields: { product: 'Use at most four different fence products.' } };
    for (const item of raw.additionalFences) {
      if (!record(item) || typeof item.sku !== 'string' || typeof item.lengthFt !== 'number') return { ok: false, fields: { product: 'The additional fence could not be read.' } };
      additionalFences.push({ sku: item.sku, lengthFt: item.lengthFt });
    }
  }
  const input: ShopOrderInput = { fenceSku: raw.fenceSku, lengthFt: raw.lengthFt, additionalFences, gates: { ft12: rawGates.ft12 as number, ft6: rawGates.ft6 as number, ft3: rawGates.ft3 as number }, payByCard: raw.payByCard, discountCode: raw.discountCode.trim() };
  const result = priceShopOrder(input);
  const customer = Object.fromEntries(['name', 'email', 'phone', 'street', 'city', 'state', 'zip'].map((key) => [key, text(rawCustomer[key])])) as ShopCustomer;
  const fields = { ...result.fields };
  if (!customer.name || customer.name.length > 100) fields.name = 'Enter your name (up to 100 characters).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || customer.email.length > 120) fields.email = 'Enter a valid email address.';
  if (customer.phone.replace(/\D/g, '').length < 7 || customer.phone.replace(/\D/g, '').length > 15 || customer.phone.length > 40) fields.phone = 'Enter a valid phone number.';
  if (!customer.street || customer.street.length > 200) fields.street = 'Enter the street address.';
  if (!customer.city || customer.city.length > 80) fields.city = 'Enter the city.';
  customer.state = customer.state.toUpperCase();
  if (!US_STATES.includes(customer.state)) fields.state = 'Choose a US state.';
  if (!/^\d{5}(-\d{4})?$/.test(customer.zip)) fields.zip = 'Enter a US ZIP code.';
  if (Object.keys(fields).length) return { ok: false, fields };
  return { ok: true, kind: 'order', order: { customer, input, result } };
}

export const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export const estimateNotice = 'Estimated total subject to final measurement. Dura Fence Metal will confirm measurements and payment arrangements before installation.';

export function shopOrderText(order: ShopOrder, reference: string, date: string): string {
  const { customer: c, result: r } = order;
  return [
    'Dura Fence Metal — Estimated invoice', `Reference: ${reference}`, `Date: ${date}`,
    `Customer: ${c.name}`, `Email: ${c.email}`, `Phone: ${c.phone}`,
    `Project: ${c.street}, ${c.city}, ${c.state} ${c.zip}`, '',
    ...r.lines.map((line) => `${line.name}: ${line.quantity} ${line.unit} × ${formatReceiptMoney(line.unitCents)} = ${formatReceiptMoney(line.amountCents)}`), '',
    ...r.notes, '',
    `Subtotal: ${formatReceiptMoney(r.subtotalCents)}`,
    `Discount${r.discount.code ? ` (${r.discount.code})` : ''}: -${formatReceiptMoney(r.discount.appliedCents)}`,
    `Tax (${order.input.payByCard ? 'card, 7%' : 'cash'}): ${formatReceiptMoney(r.taxCents)}`,
    `Estimated total: ${formatReceiptMoney(r.totalCents)}`,
    `Due with request (25%): ${formatReceiptMoney(r.depositCents)}`, '',
    'Card adds 7% tax. Cash does not. Payment is arranged directly with the business.',
    estimateNotice, '', 'Questions? info@durafencemetal.com | 678 622 1776',
  ].join('\n');
}
