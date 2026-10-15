import { priceShopOrder, resolveShopItem, type ShopLine, type ShopOrderInput } from '../data/shop-checkout.ts';

type CommerceEvent = 'ViewContent' | 'Lead';

function productData(lines: ShopLine[], valueCents = lines.reduce((sum, line) => sum + line.amountCents, 0)) {
  return {
    // Catalog retailer IDs are the SKUs, not Meta's numeric product object IDs.
    content_ids: lines.map(line => line.sku), content_type: 'product',
    contents: lines.map(line => ({ id: line.sku, quantity: line.quantity, item_price: line.unitCents / 100 })),
    value: valueCents / 100, currency: 'USD',
    num_items: lines.reduce((sum, line) => sum + Math.round(line.quantity * 100), 0) / 100,
  };
}

function emitCommerceEvent(name: CommerceEvent, data: ReturnType<typeof productData>) {
  document.dispatchEvent(new CustomEvent('dura-fence:commerce', { detail: { name, data } }));
}

export function createShopCommerceTracker(emit = emitCommerceEvent) {
  const viewed = new Set<string>();
  const view = (ids: string[]) => {
    const lines: ShopLine[] = [];
    for (const id of ids) {
      const item = resolveShopItem(id);
      if (!item || viewed.has(item.sku)) continue;
      viewed.add(item.sku);
      lines.push({ sku: item.sku, name: item.name, quantity: 1, unit: item.kind === 'fence' ? 'ft' : 'each', unitCents: item.unitCents, amountCents: item.unitCents });
    }
    if (lines.length) emit('ViewContent', productData(lines));
  };
  return {
    view,
    observe(input: ShopOrderInput) {
      const result = priceShopOrder(input);
      if (Object.keys(result.fields).length) return;
      view(result.lines.map(line => line.sku));
    },
    lead(input: ShopOrderInput) {
      const result = priceShopOrder(input);
      if (!Object.keys(result.fields).length) emit('Lead', productData(result.lines, result.totalCents));
    },
  };
}
