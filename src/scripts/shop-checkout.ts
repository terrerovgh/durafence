import { checkoutCatalog, prepareShopOrder, priceShopOrder, resolveShopItem, readShopCheckoutQuery, type ShopOrderInput, type ShopFenceInput } from '../data/shop-checkout.ts';
import { formatReceiptMoney } from '../data/estimate.ts';
import { createShopCommerceTracker } from './meta-commerce.ts';

const form = document.querySelector<HTMLFormElement>('#shop-checkout');
if (form) {
  const commerce = createShopCommerceTracker();
  const element = <T extends HTMLElement>(id: string) => form.querySelector<T>(`#${id}`)!;
  const control = (id: string) => element<HTMLInputElement | HTMLSelectElement>(id);
  const submit = element<HTMLButtonElement>('checkout-submit');
  const status = element<HTMLParagraphElement>('checkout-status');
  const additionalRows = element('additional-fences');
  const addFence = element<HTMLButtonElement>('add-fence');
  let sending = false;
  let completed = false;
  const readOrder = (): ShopOrderInput => {
    const selected = resolveShopItem(control('product').value);
    const hasFence = selected?.kind === 'fence';
    return {
      fenceSku: hasFence ? selected.sku : '', lengthFt: hasFence ? Number(control('lengthFt').value) : 0,
      additionalFences: [...additionalRows.querySelectorAll<HTMLElement>('[data-fence-row]')].map(row => ({
        sku: row.querySelector<HTMLSelectElement>('select')!.value,
        lengthFt: Number(row.querySelector<HTMLInputElement>('input')!.value),
      })),
      gates: { ft12: Number(control('ft12').value), ft6: Number(control('ft6').value), ft3: Number(control('ft3').value) },
      payByCard: control('payment').value === 'card', discountCode: control('discountCode').value.trim(),
    };
  };
  const readBody = () => ({
    customer: Object.fromEntries(['name', 'email', 'phone', 'street', 'city', 'state', 'zip'].map((key) => [key, control(key).value])),
    order: readOrder(), df_leave_blank: control('df_leave_blank').value,
  });
  const showErrors = (fields: Record<string, string>) => {
    for (const node of form.querySelectorAll<HTMLElement>('[data-error]')) {
      const id = node.dataset.error!;
      node.textContent = fields[id] ?? '';
      node.hidden = !fields[id];
      control(id).setAttribute('aria-invalid', fields[id] ? 'true' : 'false');
    }
  };
  const renderAdditionalFences = (fences: ShopFenceInput[]) => {
    additionalRows.replaceChildren();
    for (const [index, fence] of fences.entries()) {
      const row = document.createElement('div'); row.className = 'additional-fence-row'; row.dataset.fenceRow = '';
      const skuId = `additional-${index}-sku`;
      const feetId = `additional-${index}-feet`;
      const skuLabel = document.createElement('label'); skuLabel.htmlFor = skuId; skuLabel.textContent = `Additional fence package ${index + 1}`;
      const select = document.createElement('select'); select.id = skuId; select.className = 'field-input';
      select.append(new Option('Choose a fence package', ''));
      for (const item of checkoutCatalog) {
        if (item.kind === 'fence') select.append(new Option(`${item.name} — ${formatReceiptMoney(item.unitCents)}/ft`, item.sku));
      }
      select.value = fence.sku;
      const feetLabel = document.createElement('label'); feetLabel.htmlFor = feetId; feetLabel.textContent = 'Estimated linear feet';
      const feet = document.createElement('input');
      Object.assign(feet, { id: feetId, type: 'number', inputMode: 'decimal', min: '0.01', max: '5000', step: '0.01', className: 'field-input', required: true, value: fence.lengthFt ? String(fence.lengthFt) : '' });
      const errors = [skuId, feetId].map(id => {
        const error = document.createElement('p'); error.id = `error-${id}`; error.className = 'error'; error.dataset.error = id; error.hidden = true;
        (id === skuId ? select : feet).setAttribute('aria-describedby', error.id);
        return error;
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn-steel'; remove.textContent = 'Remove this fence package';
      remove.addEventListener('click', () => {
        if (sending) return;
        renderAdditionalFences(readOrder().additionalFences!.filter((_, position) => position !== index));
        completed = false; status.textContent = ''; update(); commerce.observe(readOrder()); addFence.focus();
      });
      row.append(skuLabel, select, errors[0], feetLabel, feet, errors[1], remove);
      additionalRows.append(row);
    }
  };
  const update = () => {
    const input = readOrder();
    const result = priceShopOrder(input);
    element('fence-length').hidden = !input.fenceSku;
    control('lengthFt').required = !!input.fenceSku;
    const notes = element('package-notes');
    notes.hidden = !result.lines.some(line => line.unit === 'ft');
    notes.textContent = result.notes.join(' ');
    const lines = element('order-lines');
    lines.replaceChildren();
    for (const line of result.lines) {
      const row = document.createElement('div'); row.className = 'order-line';
      const name = document.createElement('strong'); name.textContent = line.name;
      const detail = document.createElement('small');
      detail.textContent = `${line.quantity} ${line.unit} × ${formatReceiptMoney(line.unitCents)} = ${formatReceiptMoney(line.amountCents)}`;
      row.append(name, detail); lines.append(row);
    }
    if (!result.lines.length) lines.textContent = 'Choose a product and enter your quantities.';
    const totals = element('order-totals'); totals.replaceChildren();
    for (const [label, amount, strong] of [
      ['Subtotal', result.subtotalCents, false],
      ['Discount', -result.discount.appliedCents, false],
      [input.payByCard ? 'Tax (card, 7%)' : 'Tax (cash)', result.taxCents, false],
      ['Estimated total', result.totalCents, true],
      ['Estimated deposit (25%)', result.depositCents, true],
    ] as const) {
      const row = document.createElement('div'); row.className = 'total-row';
      const term = document.createElement('dt'); term.textContent = label;
      const value = document.createElement('dd');
      if (strong) { const text = document.createElement('strong'); text.textContent = formatReceiptMoney(amount); value.append(text); }
      else value.textContent = formatReceiptMoney(amount);
      row.append(term, value); totals.append(row);
    }
    if (!sending) {
      showErrors(result.fields);
      submit.disabled = false;
      submit.textContent = 'Email my estimate';
    }
    addFence.disabled = sending || (input.additionalFences?.length ?? 0) >= 3;
  };
  const pickProduct = () => {
    const item = resolveShopItem(control('product').value);
    if (item?.kind === 'gate' && Number(control(item.gateId).value) === 0) control(item.gateId).value = '1';
    update();
  };
  const incoming = readShopCheckoutQuery(new URLSearchParams(window.location.search));
  control('product').value = incoming.product;
  if (incoming.lengthFt !== undefined) control('lengthFt').value = String(incoming.lengthFt);
  renderAdditionalFences(incoming.additionalFences);
  for (const id of ['ft12', 'ft6', 'ft3'] as const) control(id).value = String(incoming.gates[id]);
  control('discountCode').value = incoming.discountCode;
  const importNotice = element('cart-import-notice');
  importNotice.textContent = incoming.importError;
  importNotice.hidden = !incoming.importError;
  update();
  commerce.view([incoming.product, ...incoming.additionalFences.map(item => item.sku)]);
  commerce.observe(readOrder());
  form.addEventListener('input', () => {
    if (!sending) { completed = false; status.textContent = ''; update(); }
  });
  control('product').addEventListener('change', () => { importNotice.hidden = true; pickProduct(); });
  form.addEventListener('change', (event) => {
    if (sending) return;
    const target = event.target as HTMLElement;
    if (target.id === 'product' || /^additional-\d+-sku$/.test(target.id)) {
      commerce.view([(target as HTMLSelectElement).value]);
    }
    // A product shown in an estimate is a view, not a cart or checkout action.
    if (['product', 'lengthFt', 'ft12', 'ft6', 'ft3'].includes(target.id) || /^additional-\d+-(sku|feet)$/.test(target.id)) {
      commerce.observe(readOrder());
    }
  });
  addFence.addEventListener('click', () => {
    if (sending) return;
    const fences = readOrder().additionalFences ?? [];
    if (fences.length >= 3) return;
    renderAdditionalFences([...fences, { sku: '', lengthFt: 0 }]);
    completed = false; status.textContent = ''; update();
    additionalRows.querySelectorAll<HTMLSelectElement>('select')[fences.length].focus();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending || completed) return;
    const body = readBody();
    const prepared = prepareShopOrder(body);
    if (!prepared.ok) {
      showErrors(prepared.fields); status.textContent = 'Check the highlighted fields.';
      const first = Object.keys(prepared.fields)[0]; control(first)?.focus();
      return;
    }
    sending = true; submit.disabled = true; submit.textContent = 'Sending…';
    status.textContent = 'Creating your PDF and sending the email…';
    try {
      const response = await fetch('/api/shop-checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json() as { ok?: boolean; message?: string; fields?: Record<string, string>; reference?: string };
      if (!response.ok || !result.ok) { showErrors(result.fields ?? {}); throw new Error(result.message || 'The email was not sent. Please try again.'); }
      completed = true; status.textContent = result.message || 'Your estimated invoice has been emailed.';
      submit.textContent = 'Estimate sent'; status.focus();
      if (prepared.kind === 'order' && result.reference) commerce.lead(body.order);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Sending could not be confirmed. Check your inbox before trying again.';
      submit.textContent = 'Email my estimate';
    } finally { sending = false; submit.disabled = completed; }
  });
}
