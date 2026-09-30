import {
  ESTIMATE_STORAGE_KEY,
  amountDueCents,
  applyDiscount,
  cardTaxCents,
  depositCents,
  estimateSummary,
  formatFeetInches,
  formatReceiptMoney,
  paymentSummary,
  maxAluminumGates,
  maxGateQty,
  priceEstimate,
  rateLine,
  screwLine,
  type Estimate,
  type EstimateInput,
  type ExtraGateId,
  type Labor,
  type PackageId,
  type PriceGroup,
  type SheetLine,
} from '../data/estimate';
import { bayFromEstimate, drawBay } from './fence-drawing';
import { customerErrors, type EstimateCustomer } from '../data/estimate-mail';

function readDecimal(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  return Number(trimmed);
}

function readInput(root: HTMLElement): EstimateInput {
  const packageValue = root.querySelector<HTMLInputElement>('input[name="package"]:checked')?.value;
  const laborValue = root.querySelector<HTMLInputElement>('input[name="labor"]:checked')?.value;
  const packageId: PackageId = packageValue === 'standard' ? 'standard' : 'premium';
  const labor: Labor = laborValue === 'materials' ? 'materials' : 'installed';
  const extraGates = { ft12: 0, ft6: 0, ft3: 0 };

  (['ft12', 'ft6', 'ft3'] as ExtraGateId[]).forEach((id) => {
    const field = root.querySelector<HTMLInputElement>(`input[name="${id}"]`);
    extraGates[id] = Math.round(readDecimal(field?.value ?? '0'));
  });

  const aluminumGates = [...root.querySelectorAll<HTMLElement>('[data-aluminum-row]')].map((row) => {
    const width = row.querySelector<HTMLInputElement>('[data-aluminum-width]');
    const choice = row.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value;
    const gateLabor: Labor = choice === 'materials' ? 'materials' : 'installed';
    return { widthFt: readDecimal(width?.value ?? ''), labor: gateLabor };
  });

  return {
    lengthFt: readDecimal(root.querySelector<HTMLInputElement>('#estimate-length')?.value ?? ''),
    packageId,
    labor,
    extraGates,
    extraScrewLb: readDecimal(root.querySelector<HTMLInputElement>('#estimate-screws')?.value ?? ''),
    aluminumGates,
  };
}

function setFieldError(root: ParentNode, field: string, message: string | undefined): boolean {
  const slot = root.querySelector<HTMLElement>(`[data-error-for="${CSS.escape(field)}"]`);
  if (!slot) return false;
  slot.hidden = !message;
  slot.textContent = message ?? '';
  const input = root.querySelector<HTMLElement>(`[name="${CSS.escape(field)}"]`);
  if (input) {
    const note = input.dataset.note ?? '';
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', [slot.id, note].filter(Boolean).join(' '));
    } else {
      input.removeAttribute('aria-invalid');
      if (note) input.setAttribute('aria-describedby', note);
      else input.removeAttribute('aria-describedby');
    }
  }
  return true;
}

function payByCard(root: HTMLElement): boolean {
  return root.querySelector<HTMLInputElement>('[data-pay-card]')?.checked === true;
}

function discountCode(root: HTMLElement): string {
  return root.querySelector<HTMLInputElement>('[data-discount-code]')?.value ?? '';
}

function renderReceipt(root: HTMLElement, result: Estimate, heightFt: number): void {
  const body = root.querySelector<HTMLElement>('[data-receipt-body]');
  const intro = root.querySelector<HTMLElement>('[data-receipt-intro]');
  const subtotal = root.querySelector<HTMLElement>('[data-receipt-subtotal]');
  const amount = root.querySelector<HTMLElement>('[data-total-amount]');
  const deposit = root.querySelector<HTMLElement>('[data-deposit-amount]');
  const taxAmount = root.querySelector<HTMLElement>('[data-tax-amount]');
  const taxNote = root.querySelector<HTMLElement>('[data-tax-note]');
  const discountRow = root.querySelector<HTMLElement>('[data-discount-row]');
  const discountNote = root.querySelector<HTMLElement>('[data-discount-note]');
  const discountAmount = root.querySelector<HTMLElement>('[data-discount-amount]');
  const discountError = root.querySelector<HTMLElement>('[data-discount-error]');
  const discountInput = root.querySelector<HTMLInputElement>('[data-discount-code]');
  const inline = root.querySelector<HTMLElement>('[data-inline-total]');
  const caveat = root.querySelector<HTMLElement>('[data-caveat]');
  const card = payByCard(root);
  const code = discountCode(root);
  const discount = applyDiscount(result.totalCents, code);
  const net = result.totalCents - discount.appliedCents;
  const tax = cardTaxCents(net, card);
  const dueCents = amountDueCents(result.totalCents, card, code);
  const merchandise = formatReceiptMoney(result.totalCents);
  const total = formatReceiptMoney(dueCents);
  const due = formatReceiptMoney(depositCents(dueCents));

  if (amount) amount.textContent = total;
  if (deposit) deposit.textContent = due;
  if (taxAmount) taxAmount.textContent = formatReceiptMoney(tax);
  if (taxNote) taxNote.textContent = card ? 'Card, 7%' : 'Cash. No tax.';
  if (inline) inline.textContent = `Total ${total}. Due with request ${due}.`;
  if (discountRow) discountRow.hidden = discount.kind !== 'dollars' && discount.kind !== 'percent';
  if (discountAmount) discountAmount.textContent = formatReceiptMoney(-discount.appliedCents);
  if (discountNote) {
    const off = discount.kind === 'percent' ? `${discount.percent}% off` : `${formatReceiptMoney(discount.requestedCents)} off`;
    const limited = discount.appliedCents < discount.requestedCents ? ', limited to the order' : '';
    discountNote.textContent = discount.code ? `${discount.code} · ${off}${limited}` : '';
  }
  if (discountError) {
    discountError.hidden = !discount.error;
    discountError.textContent = discount.error;
  }
  if (discountInput) {
    if (discount.error) discountInput.setAttribute('aria-invalid', 'true');
    else discountInput.removeAttribute('aria-invalid');
  }
  if (intro) intro.hidden = !result.empty;
  if (caveat) caveat.hidden = !result.hasFence;
  if (subtotal) {
    subtotal.hidden = result.empty;
    subtotal.replaceChildren(pair('Subtotal', result.empty ? '' : merchandise));
  }
  if (!body) return;

  body.replaceChildren();
  const spec = document.createElement('dl');
  spec.className = 'spec';
  spec.append(
    specRow('Package', result.packageName),
    specRow('Labor', result.laborName),
    specRow('Height', formatFeetInches(heightFt)),
    specRow('Run', result.runLabel ? `${result.runLabel} ft` : '—'),
    specRow('Rate', `${formatReceiptMoney(result.ratePerFoot * 100)} / ft`),
  );
  body.append(spec);
  for (const group of result.groups) body.append(renderGroup(group));
  fillInvoice(root, result, heightFt, card, discount, merchandise, formatReceiptMoney(tax), total, due);
}

function fillInvoice(
  root: HTMLElement,
  result: Estimate,
  heightFt: number,
  card: boolean,
  discount: ReturnType<typeof applyDiscount>,
  merchandise: string,
  tax: string,
  total: string,
  due: string,
): void {
  const order = root.querySelector<HTMLElement>('[data-invoice-order]');
  const host = root.querySelector<HTMLElement>('[data-invoice-drawing]');
  const caption = root.querySelector<HTMLElement>('[data-invoice-caption]');
  const note = root.querySelector<HTMLElement>('[data-invoice-note]');
  const printBtn = root.querySelector<HTMLButtonElement>('[data-print-invoice]');

  if (printBtn) printBtn.disabled = result.empty;
  const emailBtn = root.querySelector<HTMLButtonElement>('[data-email-invoice]');
  if (emailBtn && emailBtn.dataset.sending !== 'true') emailBtn.disabled = result.empty;
  root.querySelectorAll<HTMLElement>('[data-invoice-customer]').forEach((slot) => {
    const field = root.querySelector<HTMLInputElement>(`[data-customer-field="${slot.dataset.invoiceCustomer}"]`);
    slot.textContent = field?.value.trim() || 'Not provided';
  });
  const installation = root.querySelector<HTMLElement>('[data-invoice-installation]');
  if (installation) installation.textContent = result.hasFence
    ? `${result.packageName} · ${result.laborName}. Posts spaced ${formatFeetInches(result.postSpacingFt)} on center, ${result.railCount} rails per bay and ${result.screwsPerPicket} screws per picket. Material quantities for the full run are itemized in the order.`
    : 'No fence run in this order. Gate and accessory specifications are itemized in the order.';
  if (host) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');
    host.replaceChildren(svg);
    if (result.hasFence) drawBay(svg, bayFromEstimate(result, heightFt), 'invoice');
    else host.textContent = 'Gate / accessory order — no fence elevation applicable.';
  }
  if (caption) caption.textContent = result.hasFence ? root.querySelector('[data-drawing-note]')?.textContent ?? '' : '';
  if (note) {
    note.hidden = !result.hasFence || heightFt === 6;
    note.textContent = `Requested height: ${formatFeetInches(heightFt)}. The typical detail illustrates a 6 ft fence; confirm the final height and post specification before fabrication.`;
  }
  if (!order) return;

  const slip = document.createElement('div');
  slip.className = 'slip';

  const title = document.createElement('p');
  title.className = 'slip-title';
  title.textContent = 'Order details';
  slip.append(title);

  const specs = document.createElement('dl');
  specs.className = 'specs';
  for (const [term, value] of [
    ['Package', result.packageName],
    ['Labor', result.laborName],
    ['Height', formatFeetInches(heightFt)],
    ['Run', result.runLabel ? `${result.runLabel} ft` : '—'],
    ['Rate', `${formatReceiptMoney(result.ratePerFoot * 100)} / ft`],
    ['Payment', card ? 'Card' : 'Cash'],
  ] as const) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    specs.append(dt, dd);
  }
  slip.append(specs);

  for (const group of result.groups) {
    const section = document.createElement('section');
    section.className = 'slip-group';
    const kicker = document.createElement('p');
    kicker.className = 'slip-kicker';
    kicker.textContent = group.label;
    section.append(kicker);
    for (const line of group.lines) section.append(slipRow(line.label, line.detail, formatReceiptMoney(line.amountCents)));
    for (const item of group.notes) section.append(slipRow(item.label, item.detail, item.value));
    section.append(slipRow(`${group.label} subtotal`, '', formatReceiptMoney(group.subtotalCents), 'slip-sub'));
    slip.append(section);
  }

  const totals = document.createElement('section');
  totals.className = 'slip-totals';
  totals.append(slipRow('Subtotal', '', merchandise, 'slip-sub'));
  if (discount.appliedCents > 0) {
    const off = discount.kind === 'percent' ? `${discount.percent}% off` : `${formatReceiptMoney(discount.requestedCents)} off`;
    totals.append(slipRow('Discount', off, formatReceiptMoney(-discount.appliedCents)));
  }
  totals.append(slipRow('Tax', card ? 'Card, 7%' : 'Cash', tax));
  totals.append(slipRow('Total', '', total, 'slip-total'));
  totals.append(slipRow('Due with request', '25% of the total', due, 'slip-due'));
  slip.append(totals);

  const notes = document.createElement('div');
  notes.className = 'slip-notes';
  const payNote = document.createElement('p');
  payNote.textContent = 'Card adds 7% tax. Cash does not.';
  notes.append(payNote);
  if (result.hasFence) {
    const corner = document.createElement('p');
    corner.textContent = 'Corners, and a gate opening taken out of this length, can change the post count. The price follows the footage.';
    notes.append(corner);
  }
  slip.append(notes);
  order.replaceChildren(slip);
}

function slipRow(label: string, detail: string, amount: string, kind = ''): HTMLDivElement {
  const row = document.createElement('div');
  row.className = kind ? `slip-row ${kind}` : 'slip-row';
  const text = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'slip-name';
  name.textContent = label;
  text.append(name);
  if (detail) {
    const extra = document.createElement('span');
    extra.className = 'slip-detail';
    extra.textContent = detail;
    text.append(extra);
  }
  const value = document.createElement('span');
  value.className = 'slip-amt';
  value.textContent = amount;
  row.append(text, value);
  return row;
}

function renderGroup(group: PriceGroup): HTMLElement {
  const section = document.createElement('section');
  section.className = 'group';
  const heading = document.createElement('p');
  heading.className = 'group-label';
  heading.textContent = group.label;
  const list = document.createElement('ul');
  for (const line of group.lines) list.append(moneyRow(line.label, line.detail, formatReceiptMoney(line.amountCents)));
  for (const note of group.notes) list.append(noteRow(note));
  const sub = moneyRow(`${group.label} subtotal`, '', formatReceiptMoney(group.subtotalCents));
  sub.classList.add('sub');
  list.append(sub);
  section.append(heading, list);
  return section;
}

function moneyRow(label: string, detail: string, amount: string): HTMLLIElement {
  const item = document.createElement('li');
  const text = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = label;
  text.append(name);
  if (detail) {
    const extra = document.createElement('span');
    extra.className = 'detail';
    extra.textContent = detail;
    text.append(extra);
  }
  const value = document.createElement('span');
  value.className = 'amt';
  value.textContent = amount;
  item.append(text, value);
  return item;
}

function noteRow(note: SheetLine): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'note';
  const name = document.createElement('span');
  name.textContent = note.detail ? `${note.label}, ${note.detail}` : note.label;
  const value = document.createElement('span');
  value.className = 'amt';
  value.textContent = note.value;
  item.append(name, value);
  return item;
}

function specRow(term: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}

function pair(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const name = document.createElement('span');
  name.textContent = label;
  const amount = document.createElement('span');
  amount.textContent = value;
  fragment.append(name, amount);
  return fragment;
}

function readCustomer(root: HTMLElement): EstimateCustomer {
  const value = (field: string) => root.querySelector<HTMLInputElement>(`[data-customer-field="${field}"]`)?.value.trim() ?? '';
  return {
    name: value('name'),
    address: value('address'),
    phone: value('phone'),
    email: value('email'),
  };
}

function mountAddressAutocomplete(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>('#invoice-address');
  const list = root.querySelector<HTMLElement>('#invoice-address-list');
  const help = root.querySelector<HTMLElement>('[data-address-help]');
  if (!input || !list || !help) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let validationController: AbortController | undefined;
  let version = 0;
  let validationVersion = 0;

  const close = () => {
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const validateCurrent = async () => {
    const address = input.value.trim();
    if (!address) return;
    validationController?.abort();
    validationController = new AbortController();
    const current = ++validationVersion;
    help.textContent = 'Checking the address…';
    try {
      const response = await fetch(`/api/estimate-address?address=${encodeURIComponent(address)}`, { signal: validationController.signal });
      if (!response.ok) throw new Error('Verification unavailable');
      const body = await response.json() as { valid?: boolean };
      if (current !== validationVersion) return;
      if (body.valid) {
        setFieldError(root, 'customer-address', undefined);
        help.textContent = 'Address matched a US Census address range.';
      } else {
        setFieldError(root, 'customer-address', 'This address could not be matched. Check the street, city, and state.');
        help.textContent = 'Check the street number, city, and state.';
      }
    } catch (error) {
      if (current !== validationVersion || (error instanceof DOMException && error.name === 'AbortError')) return;
      help.textContent = 'Address verification is unavailable right now. You can try again when you email the estimate.';
    }
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    controller?.abort();
    validationController?.abort();
    ++validationVersion;
    const current = ++version;
    close();
    setFieldError(root, 'customer-address', undefined);
    const query = input.value.trim();
    if (query.length < 4) {
      help.textContent = 'Start typing a US street address, then choose a suggestion or enter the full address.';
      return;
    }
    help.textContent = 'Searching US addresses…';
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const response = await fetch(`/api/estimate-address?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Suggestions unavailable');
        const body = await response.json() as { suggestions?: string[] };
        if (current !== version) return;
        const suggestions = Array.isArray(body.suggestions) ? body.suggestions : [];
        for (const suggestion of suggestions) {
          if (typeof suggestion !== 'string') continue;
          const option = document.createElement('button');
          option.type = 'button';
          option.role = 'option';
          option.textContent = suggestion;
          option.addEventListener('click', () => {
            input.value = suggestion;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            clearTimeout(timer);
            controller?.abort();
            ++version;
            close();
            input.focus();
            void validateCurrent();
          });
          list.append(option);
        }
        list.hidden = list.childElementCount === 0;
        input.setAttribute('aria-expanded', String(!list.hidden));
        help.textContent = suggestions.length ? `${suggestions.length} address suggestions. Use the arrow keys to choose one.` : 'No suggestions found. Enter the complete street address, city, and state.';
      } catch (error) {
        if (current !== version || (error instanceof DOMException && error.name === 'AbortError')) return;
        help.textContent = 'Suggestions are unavailable. Enter the complete street address, city, and state.';
      }
    }, 350);
  });

  input.addEventListener('blur', () => { void validateCurrent(); });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { clearTimeout(timer); controller?.abort(); ++version; close(); return; }
    if (event.key !== 'ArrowDown' || list.hidden) return;
    event.preventDefault();
    list.querySelector<HTMLButtonElement>('button')?.focus();
  });
  list.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { clearTimeout(timer); controller?.abort(); ++version; close(); input.focus(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const options = [...list.querySelectorAll<HTMLButtonElement>('button')];
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (next < 0) input.focus();
    else options[Math.min(next, options.length - 1)]?.focus();
  });
  root.addEventListener('click', (event) => {
    if (event.target instanceof Node && !input.contains(event.target) && !list.contains(event.target)) close();
  });
}

function setEmailStatus(root: HTMLElement, message: string, tone: '' | 'ok' | 'bad'): void {
  const status = root.querySelector<HTMLElement>('[data-email-status]');
  if (!status) return;
  status.hidden = message.length === 0;
  status.textContent = message;
  if (tone) status.dataset.tone = tone;
  else delete status.dataset.tone;
}

function estimatePayload(root: HTMLElement, heightFt: number) {
  return {
    customer: readCustomer(root),
    estimate: {
      ...readInput(root),
      heightFt,
      payByCard: payByCard(root),
      discountCode: discountCode(root).trim(),
    },
    df_leave_blank: root.querySelector<HTMLInputElement>('[data-honeypot]')?.value ?? '',
  };
}

async function emailEstimate(root: HTMLElement, result: Estimate): Promise<void> {
  const button = root.querySelector<HTMLButtonElement>('[data-email-invoice]');
  if (!button || button.dataset.sending === 'true' || result.empty) return;

  for (const field of ['customer-name', 'customer-phone', 'customer-email', 'customer-address', 'height', 'discount']) {
    setFieldError(root, field, undefined);
  }

  const height = readHeight(root);
  if (height.error) {
    setFieldError(root, 'height', height.error);
    setEmailStatus(root, height.error, 'bad');
    return;
  }
  if (result.issues.length > 0) {
    setEmailStatus(root, 'Fix the estimate before sending it.', 'bad');
    return;
  }
  const discount = applyDiscount(result.totalCents, discountCode(root));
  if (discount.error) {
    setEmailStatus(root, discount.error, 'bad');
    return;
  }

  const customer = readCustomer(root);
  const errors = customerErrors(customer);
  if (Object.keys(errors).length > 0) {
    for (const [field, message] of Object.entries(errors)) setFieldError(root, field, message);
    setEmailStatus(root, 'Check the customer details.', 'bad');
    root.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    return;
  }

  button.dataset.sending = 'true';
  button.disabled = true;
  button.textContent = 'Sending';
  setEmailStatus(root, 'Sending the estimate.', '');

  try {
    const response = await fetch('/api/estimate-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(estimatePayload(root, height.feet)),
    });
    let body: { ok?: boolean; message?: string; fields?: Record<string, string> } = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (!response.ok || !body.ok) {
      if (body.fields) {
        for (const [field, message] of Object.entries(body.fields)) {
          if (typeof message === 'string') setFieldError(root, field, message);
        }
      }
      setEmailStatus(root, body.message || 'The estimate was not sent. Try again in a minute.', 'bad');
      return;
    }
    document.dispatchEvent(new Event('dura-fence:lead'));
    setEmailStatus(root, body.message || `Sent to ${customer.email}. A copy went to the shop.`, 'ok');
  } catch {
    setEmailStatus(root, 'The estimate was not sent. Try again in a minute.', 'bad');
  } finally {
    delete button.dataset.sending;
    button.textContent = 'Email PDF';
    button.disabled = priceEstimate(readInput(root)).empty;
  }
}

function readHeight(root: HTMLElement): { feet: number; error?: string } {
  const raw = root.querySelector<HTMLInputElement>('#estimate-height')?.value ?? '';
  if (!raw.trim()) return { feet: 6, error: 'Enter a height from 3 to 12 feet.' };
  const feet = Number(raw);
  if (!Number.isFinite(feet) || feet < 3 || feet > 12) return { feet: 6, error: 'Enter a height from 3 to 12 feet.' };
  return { feet };
}

function render(root: HTMLElement, result: Estimate): void {
  const height = readHeight(root);
  const drawing = root.querySelector<SVGSVGElement>('[data-drawing]');
  const note = root.querySelector<HTMLElement>('[data-drawing-note]');
  const caption = root.querySelector<HTMLElement>('[data-drawing-caption]');
  if (drawing) drawBay(drawing, bayFromEstimate(result, height.feet));
  const bayNote = result.runLabel
    ? `One bay of a ${result.runLabel} ft run. Posts are 8 ft, with 2 ft in concrete, ${result.postSpacingFt} ft on center. Pickets are 6 ft with a pointed top.`
    : `Posts are 8 ft, with 2 ft in concrete. Pickets are 6 ft with a pointed top. Enter the run to price the line.`;
  if (note) note.textContent = bayNote;
  if (caption) caption.textContent = drawing?.querySelector('title')?.textContent ?? bayNote;

  renderReceipt(root, result, height.feet);
  setFieldError(root, 'height', height.error);

  const rate = root.querySelector<HTMLElement>('[data-rate-line]');
  const screws = root.querySelector<HTMLElement>('[data-screw-note]');
  const loose = root.querySelector<HTMLElement>('[data-loose-issues]');
  if (rate) rate.textContent = rateLine(result);
  if (screws) screws.textContent = screwLine(result);

  const placed = new Set<string>();
  for (const field of ['length', 'screws', 'ft12', 'ft6', 'ft3']) {
    const message = result.issues.find((issue) => issue.field === field)?.message;
    if (setFieldError(root, field, message)) placed.add(field);
  }

  const rows = [...root.querySelectorAll<HTMLElement>('[data-aluminum-row]')];
  rows.forEach((row, index) => {
    const message = result.issues.find((issue) => issue.field === `aluminum-${index}`)?.message;
    const slot = row.querySelector<HTMLElement>('[data-error]');
    const input = row.querySelector<HTMLElement>('[data-aluminum-width]');
    if (slot) {
      slot.hidden = !message;
      slot.textContent = message ?? '';
    }
    if (input) {
      if (message && slot?.id) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', slot.id);
      } else {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
    }
    placed.add(`aluminum-${index}`);
  });

  if (loose) {
    loose.replaceChildren();
    for (const issue of result.issues) {
      if (placed.has(issue.field)) continue;
      const item = document.createElement('li');
      item.textContent = issue.message;
      loose.append(item);
    }
    loose.hidden = loose.childElementCount === 0;
  }
}

function addAluminumRow(list: HTMLElement, template: HTMLTemplateElement): HTMLElement | null {
  const row = template.content.firstElementChild?.cloneNode(true);
  if (!(row instanceof HTMLElement)) return null;
  const id = `aluminum-width-${list.children.length + 1}-${Date.now()}`;
  const input = row.querySelector<HTMLInputElement>('[data-aluminum-width]');
  const label = row.querySelector<HTMLLabelElement>('[data-width-label]');
  if (input) input.id = id;
  if (label) label.htmlFor = id;
  const error = row.querySelector<HTMLElement>('[data-error]');
  if (error) error.id = `${id}-error`;
  row.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((radio) => {
    radio.name = `${id}-labor`;
  });
  list.append(row);
  return row;
}

function syncAluminumLimit(root: HTMLElement): void {
  const count = root.querySelectorAll('[data-aluminum-row]').length;
  const add = root.querySelector<HTMLButtonElement>('[data-add-aluminum]');
  const cap = root.querySelector<HTMLElement>('[data-aluminum-cap]');
  if (add) add.disabled = count >= maxAluminumGates;
  if (cap) cap.hidden = count < maxAluminumGates;
}

export function mountEstimate(): void {
  const root = document.querySelector<HTMLElement>('[data-estimate]');
  if (!root || root.dataset.ready === 'true') return;
  root.dataset.ready = 'true';

  const form = root.querySelector<HTMLFormElement>('[data-estimate-form]');
  const list = root.querySelector<HTMLElement>('[data-aluminum-list]');
  const template = root.querySelector<HTMLTemplateElement>('#aluminum-template');
  const quote = root.querySelector<HTMLAnchorElement>('[data-quote-link]');
  if (!form || !list || !template) return;

  let latest = priceEstimate(readInput(root));

  const update = () => {
    latest = priceEstimate(readInput(root));
    render(root, latest);
    syncAluminumLimit(root);
  };

  form.addEventListener('submit', (event) => event.preventDefault());
  mountAddressAutocomplete(root);
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  root.querySelector('[data-pay-card]')?.addEventListener('change', update);
  root.querySelector('[data-discount-code]')?.addEventListener('input', update);
  root.querySelector('[data-print-invoice]')?.addEventListener('click', () => window.print());
  root.querySelector('[data-email-invoice]')?.addEventListener('click', () => {
    void emailEstimate(root, latest);
  });
  root.addEventListener('input', () => {
    const button = root.querySelector<HTMLButtonElement>('[data-email-invoice]');
    if (button?.dataset.sending === 'true') return;
    setEmailStatus(root, '', '');
  });

  form.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const step = target.closest<HTMLButtonElement>('[data-step]');
    if (step) {
      const name = step.dataset.step;
      const dir = Number(step.dataset.dir);
      if (!name || !Number.isFinite(dir)) return;
      const hidden = form.querySelector<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`);
      const shown = form.querySelector<HTMLElement>(`[data-count="${CSS.escape(name)}"]`);
      const next = Math.min(maxGateQty, Math.max(0, Math.round(readDecimal(hidden?.value ?? '0')) + dir));
      if (hidden) hidden.value = String(next);
      if (shown) shown.textContent = String(next);
      update();
      return;
    }

    if (target.closest('[data-add-aluminum]')) {
      if (list.querySelectorAll('[data-aluminum-row]').length >= maxAluminumGates) return;
      const row = addAluminumRow(list, template);
      row?.querySelector<HTMLInputElement>('[data-aluminum-width]')?.focus();
      update();
      return;
    }

    const remove = target.closest<HTMLButtonElement>('[data-remove-aluminum]');
    if (remove) {
      remove.closest('[data-aluminum-row]')?.remove();
      root.querySelector<HTMLButtonElement>('[data-add-aluminum]')?.focus();
      update();
    }
  });

  quote?.addEventListener('click', () => {
    try {
      const summary = estimateSummary(latest);
      const height = readHeight(root);
      const text = summary
        ? `Height: ${formatFeetInches(height.feet)}\n${summary}\n${paymentSummary(latest.totalCents, payByCard(root), discountCode(root))}`
        : '';
      if (text) sessionStorage.setItem(ESTIMATE_STORAGE_KEY, text);
      else sessionStorage.removeItem(ESTIMATE_STORAGE_KEY);
    } catch {
      // Private browsing can block storage. The quote form still opens.
    }
  });

  update();
}
