import { newOrder, calculate, gateDefault, money, type Order, type StoredInvoice, type MaterialKey } from './model.ts';
import { footageOf, gateWidthChoices, setFootage, setGateCount, setIncludedCameras } from './job-setup.ts';
import { PDF_OVERFLOW_EN } from '../pdf/layout-error.ts';
const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
const percent = String.fromCharCode(37);
const materialNames: Record<MaterialKey, string> = {
  posts: 'Total posts', reinforcedPosts: 'Reinforced posts, included in total', railFeet: 'Fence rails, linear feet',
  fencePlanks: 'Fence planks', gatePlanks: 'Gate planks', screws: 'Screws',
};
const sellerFallback = 'Unable to complete the request. Your edits are still in the editor.';
const overflowMessage = PDF_OVERFLOW_EN + ' You can save and edit the draft.';
const legacySellerMessages: Record<string, string> = {
  'Version de documento no admitida.': 'This document version is not supported.',
  'Texto no valido o demasiado largo.': 'Text is invalid or too long.',
  'Cantidad o importe no valido.': 'Enter a valid quantity or amount.',
  'Seleccion no valida.': 'Choose a valid option.',
  'Lista no valida o demasiado larga.': 'The list is invalid or too long.',
  'Documento no valido.': 'The document is invalid.',
  'Altura, separacion y rieles deben ser positivos.': 'Height, post spacing, and rail count must be positive.',
  'El descuento no puede superar el 100 por ciento.': 'The discount cannot exceed 100 percent.',
  'El deposito no puede superar el 100 por ciento.': 'The deposit cannot exceed 100 percent.',
  'Indica el concepto del cargo.': 'Enter a charge description.',
  'Indica el precio de las camaras adicionales o incluyelas en el acuerdo.': 'Enter a price for additional cameras or include them in the price.',
  'Identificadores y extremos de tramo no validos.': 'Run IDs and endpoints must be valid and distinct.',
  'Cada tramo debe tener longitud positiva.': 'Each run must have a positive length.',
  'Identificador de gate duplicado.': 'Each gate must have a unique ID.',
  'Los gates deben tener ancho y altura positivos.': 'Each gate must have a positive width and height.',
  'El gate referencia un tramo inexistente.': 'The selected gate run no longer exists.',
  'Los postes reforzados son parte del total de postes.': 'Reinforced posts cannot exceed the total post count.',
  'Producto o servicio incompleto.': 'Complete the product or service details.',
  'El deposito no puede superar el total.': 'The deposit cannot exceed the total.',
  'Importe fuera de rango.': 'The amount is outside the supported range.',
  'Indica el cliente antes de emitir.': 'Enter the customer before issuing this document.',
  'Indica la ubicacion del proyecto antes de emitir.': 'Enter the project address before issuing this document.',
  'Agrega cerca, gate, producto o servicio.': 'Add a fence run, gate, product, or service.',
  'Usa JSON para guardar el documento.': 'The document must be submitted as JSON.',
  'Falta el documento.': 'The document is missing.',
  'Documento demasiado grande.': 'The document is too large.',
  'Limite de pagos alcanzado.': 'The payment limit has been reached.',
  'Datos del pago no validos.': 'Enter valid payment details.',
  'Este pago ya se anulo o no existe.': 'This payment was already reversed or no longer exists.',
  'Importe del pago no valido.': 'Enter a valid payment amount.',
  'Indica un email valido para el cliente.': 'Enter a valid customer email address.',
  'El envio de correo no esta configurado.': 'Email sending is not configured.',
  'Esta revision ya fue enviada.': 'This revision has already been sent.',
  'El envio esta en curso o requiere comprobar su resultado. No se repetira automaticamente.': 'Sending is in progress or its outcome needs review. It will not be repeated automatically.',
  'No se pudo generar el PDF. El correo no se envio.': 'Unable to generate the PDF. No email was sent.',
  'Limite de 30 envios por hora. Espera antes de enviar otro documento.': 'The limit is 30 emails per hour. Wait before sending another document.',
  'El proveedor no confirmo el envio. Comprueba su registro antes de reintentar.': 'The email provider did not confirm sending. Check its activity before retrying.',
  'Documento enviado al cliente con copia al negocio.': 'Document emailed to the customer with a copy to the business.',
  'Resultado del envio sin confirmar. Comprueba el proveedor antes de cualquier reintento.': 'The email outcome is unconfirmed. Check the provider before retrying.',
  'El dashboard privado aun no esta configurado.': 'The private workspace is not configured.',
  'Acceso reservado a vendedores autorizados.': 'Access is restricted to authorized sellers.',
  'Metodo no admitido.': 'This request method is not supported.',
  'Origen no autorizado.': 'This request origin is not authorized.',
  'Revision no encontrada.': 'The revision was not found.',
  'El historial compartido aun no esta configurado.': 'Shared document history is not configured.',
  'Busqueda no valida.': 'Enter a valid search.',
  'Paginacion no valida.': 'The page request is invalid.',
  'Clave de creacion no valida.': 'The draft creation key is invalid.',
  'Autor del documento no valido.': 'The document author is invalid.',
  'Documento no encontrado.': 'The document was not found.',
  'Ruta no encontrada.': 'The requested page was not found.',
  'Revision no valida.': 'The revision is invalid.',
  'Otro vendedor guardo cambios. Recarga antes de guardar.': 'Another seller saved changes. Reload the document before saving.',
  'El documento ya es un invoice.': 'This document is already an invoice.',
  'Convierte el estimado en invoice antes de registrar pagos.': 'Convert the estimate to an invoice before recording payments.',
  'Metodo o accion no admitido.': 'This action is not supported.',
  'JSON no valido.': 'The submitted JSON is invalid.',
  'No se pudo completar la operacion. Tus cambios siguen en el editor.': 'Unable to complete the request. Your edits are still in the editor.',
  'Esta clave de creacion ya pertenece a otro acuerdo o vendedor. No se creo otro documento.': 'This draft key belongs to another document or seller. No duplicate was created.',
  'Creation write did not return its committed revision.': 'Creation could not be confirmed. Retry to recover the same document.',
  'Revision write was not confirmed.': 'The revision was not confirmed. Your edits are still in the editor.',
  'Failed to fetch': 'Unable to connect. Check your connection and try again.',
  'Load failed': 'Unable to connect. Check your connection and try again.',
  'NetworkError when attempting to fetch resource.': 'Unable to connect. Check your connection and try again.',
  'No se pudo generar el PDF. El documento sigue guardado.': 'Unable to generate the PDF. Your document is still saved.',
  'No se recibio un PDF. Comprueba tu sesion y vuelve a intentar.': 'No PDF was received. Check your session and try again.',
  'No se pudo leer la respuesta. Comprueba tu sesion y la conexion.': 'Unable to read the response. Check your session and connection.',
  'No se pudo completar la operacion.': 'Unable to complete the request.',
  'Vista previa no disponible.': 'PDF preview is unavailable.',
  'No se recibio el documento. Tus cambios siguen en el editor.': 'No document was received. Your edits are still in the editor.',
  'Una revision anterior solo se puede consultar o copiar.': 'Earlier revisions are read-only. Duplicate one to make changes.',
  'No se pudo confirmar la creacion. Reintenta para recuperar el mismo documento.': 'Creation could not be confirmed. Retry to recover the same document.',
  'No se confirmo la revision. Tus cambios siguen en el editor.': 'The revision was not confirmed. Your edits are still in the editor.',
  'No existe precio de catalogo para ese ancho. Introduce el importe negociado.': 'No catalog price is available for that width. Enter a price.',
  'Permite abrir la ventana del PDF para imprimir.': 'Allow the PDF window to open for printing.',
};

const englishSellerMessages = new Set([...Object.values(legacySellerMessages), overflowMessage]);
const legacyKeys = Object.keys(legacySellerMessages).sort((a, b) => b.length - a.length);

/** Presentation only: existing validation/API contracts and stored customer content stay unchanged. */
export function sellerMessage(value: unknown, code?: unknown, fallback = sellerFallback): string {
  if (code === 'pdf_layout_overflow' || code === 'PDF_LAYOUT_OVERFLOW' || value === PDF_OVERFLOW_EN || (typeof value === 'string' && value.startsWith('El documento no cabe'))) return overflowMessage;
  if (typeof value !== 'string') return fallback;
  const message = value.trim();
  if (Object.hasOwn(legacySellerMessages, message)) return legacySellerMessages[message];
  if (englishSellerMessages.has(message)) return message;
  const openingPrefix = 'Abertura superpuesta o fuera del tramo: ';
  const englishOpeningPrefix = 'Gate openings overlap or extend beyond run: ';
  if (message.startsWith(englishOpeningPrefix)) return message;
  if (message.startsWith(openingPrefix)) {
    const detail = message.slice(openingPrefix.length);
    const boundaries = legacyKeys.map((key) => detail.indexOf(' ' + key)).filter((at) => at >= 0);
    const boundary = boundaries.length ? Math.min(...boundaries) : -1;
    return englishOpeningPrefix + (boundary < 0 ? detail : detail.slice(0, boundary) + ' ' + sellerMessage(detail.slice(boundary + 1)));
  }
  // Validation can return several known sentences joined by a space.
  let remaining = message;
  const translated: string[] = [];
  while (remaining) {
    const key = legacyKeys.find((candidate) => remaining === candidate || remaining.startsWith(candidate + ' '));
    if (!key) return fallback;
    translated.push(legacySellerMessages[key]);
    remaining = remaining.slice(key.length).trimStart();
  }
  return translated.length ? translated.join(' ') : fallback;
}

export function jobSummaryValues(order: Order, result: ReturnType<typeof calculate>) {
  const cameras = order.cameras.included + order.cameras.extra;
  return {
    footage: result.grossFt + ' ft',
    openings: result.openingFt + ' ft',
    gates: order.gates.length + (order.gates.length === 1 ? ' gate' : ' gates'),
    cameras: String(cameras),
    'camera-detail': order.cameras.included + ' included / ' + order.cameras.extra + ' extra',
    total: money(result.totalCents),
  };
}

class InvoiceRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
type FootageInput = Pick<HTMLInputElement, 'value' | 'readOnly'>;

/** Update the draft without replacing the input or normalizing its in-progress text. */
export function editFootage(order: Order, input: Pick<FootageInput, 'value'>, refresh: (createdRun: boolean) => void): boolean {
  if (order.runs.length > 1) return false;
  const before = order.runs.length;
  setFootage(order, input.value === '' ? 0 : Number(input.value));
  if (before === 0 && order.runs.length === 1) order.runs[0].name = 'Fence';
  refresh(order.runs.length !== before);
  return true;
}

/** Synchronize the other view of the length, leaving the active input untouched. */
export function syncFootageInputs(order: Order, primary: FootageInput | null,
  runs: readonly (FootageInput | null)[], active: unknown): void {
  if (primary) {
    primary.readOnly = order.runs.length > 1;
    if (primary !== active) {
      const total = footageOf(order);
      const value = total > 0 || primary.readOnly ? String(total) : '';
      if (primary.value !== value) primary.value = value;
    }
  }
  runs.forEach((input, index) => {
    if (input && input !== active && order.runs[index]) {
      const value = String(order.runs[index].lengthFt);
      if (input.value !== value) input.value = value;
    }
  });
}

/** Validate the actual saved-revision response before making a file or navigating a popup. */
export async function fetchInvoicePdf(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    let message = 'Unable to generate the PDF. Your document is still saved.';
    try {
      const body = await response.json() as { message?: unknown; error?: unknown };
      message = sellerMessage(body.message, body.error, message);
    } catch {}
    throw new Error(message);
  }
  if (!response.headers.get('content-type')?.startsWith('application/pdf')) {
    throw new Error('No PDF was received. Check your session and try again.');
  }
  return response.blob();
}

export function mountDashboard(): void {
  const root = document.querySelector<HTMLElement>('#invoice-dashboard');
  if (!root) return;
  const node = <T extends Element = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  let order = newOrder();
  let saved: StoredInvoice | null = null;
  let creationKey = crypto.randomUUID();
  let pendingCreation: Order | null = null;
  const resetDraftIdentity = () => { creationKey = crypto.randomUUID(); pendingCreation = null; };
  let dirty = false, historical = false, busy = false;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let previewAbort: AbortController | undefined, previewUrl = '', previewEpoch = 0;
  let rows: Record<string, unknown>[] = [], query = '', cursor = 0;
  const status = (message: string, error = false) => {
    const target = node('[data-status]'); target.textContent = error ? sellerMessage(message) : message; target.dataset.error = String(error);
  };
  const api = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch('/api/invoices' + path, {
      method, credentials: 'same-origin', cache: 'no-store',
      ...(data === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
    });
    let result: { ok: boolean; message?: string; error?: string; document?: StoredInvoice; documents?: Record<string, unknown>[]; revisions?: Record<string, unknown>[] };
    try { result = await response.json(); } catch { throw new Error('Unable to read the response. Check your session and connection.'); }
    if (!response.ok || !result.ok) throw new InvoiceRequestError(sellerMessage(result.message, result.error),response.status);
    if (result.message) result.message = sellerMessage(result.message, result.error, 'Request completed.');
    return result;
  };
  const field = (label: string, path: string, value: unknown, number = false, cents = false, optional = false, placeholder = '') => {
    const display = value === null || value === undefined ? '' : cents ? Number(value) / 100 : value;
    return `<label>${label}<input data-path='${esc(path)}' type='${number ? 'number' : 'text'}' value='${esc(display)}' ${number ? 'min=0 step=0.01' : 'maxlength=300'} ${cents ? 'data-cents' : ''} ${optional ? 'data-optional' : ''} placeholder='${esc(placeholder)}' /></label>`;
  };
  const select = (label: string, path: string, value: string, choices: [string, string][]) =>
    `<label>${label}<select data-path='${esc(path)}'>${choices.map(([id, text]) => `<option value='${esc(id)}' ${id === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  const check = (label: string, path: string, checked: boolean) =>
    `<label class='check'><input type='checkbox' data-path='${esc(path)}' ${checked ? 'checked' : ''} />${label}</label>`;
  const card = (title: string, content: string, help = '') =>
    `<section class='dash-card'><h2>${title}</h2>${help ? `<p class='dash-muted'>${help}</p>` : ''}${content}</section>`;
  const button = (action: string, title: string, extra = '') => `<button class='small-button' type='button' data-action='${action}' ${extra}>${title}</button>`;
  const box = (title: string, content: string, remove: string, index: number) =>
    `<div class='row-box'><div class='row-title'><h3>${title}</h3>${button(remove, 'Remove', 'data-index=' + index)}</div><div class='fields'>${content}</div></div>`;
  const stepper = (action: string, value: number, minusLabel: string, plusLabel: string) =>
    `<div class='stepper'><button class='stepper-btn' type='button' data-action='${action}' data-delta='-1' aria-label='${esc(minusLabel)}'>−</button><output>${esc(value)}</output><button class='stepper-btn' type='button' data-action='${action}' data-delta='1' aria-label='${esc(plusLabel)}'>+</button></div>`;

  const runCards = () => order.runs.map((run, index) => box('Run ' + (index + 1),
    field('Run name', `runs.${index}.name`, run.name) + field('Run length, ft', `runs.${index}.lengthFt`, run.lengthFt, true)
    + field('Start point', `runs.${index}.startNode`, run.startNode) + field('End point', `runs.${index}.endNode`, run.endNode), 'remove-run', index)).join('');

  function render(focus?: string): void {
    const result = calculate(order, saved?.payments ?? []);
    node('[data-kind]').textContent = saved?.kind === 'invoice' ? 'Invoice' : 'Estimate';
    node('[data-number]').textContent = saved?.number ?? 'New document';
    node('[data-version]').textContent = saved ? `Revision ${saved.version} / ${historical ? 'viewing history' : dirty ? 'unsaved changes' : 'saved'}` : 'Not saved';
    const customer = card('Customer and project', `<div class='fields'>${field('Customer or company', 'customer.name', order.customer.name)}${field('Phone', 'customer.phone', order.customer.phone)}${field('Customer email', 'customer.email', order.customer.email)}${field('Project address', 'customer.address', order.customer.address)}</div>`);
    const dims = card('Pricing', `<div class='fields'>${select('Package', 'packageId', order.packageId, [['standard','Standard'],['premium','Premium']])}${select('Service', 'labor', order.labor, [['installed','Installation'],['materials','Materials only']])}${field('Price per foot, USD', 'rateCents', order.rateCents, true, true, true, String(result.rateCents / 100))}</div>${button('reset-rate', 'Use package price')}<details><summary>Fence specifications</summary><div class='fields'>${field('Fence height, ft', 'heightFt', order.heightFt, true)}${field('Post embedment, ft', 'embedFt', order.embedFt, true)}${field('Post spacing, ft', 'spacingFt', order.spacingFt, true, false, true, String(result.spacingFt))}${field('Rails per bay', 'railCount', order.railCount, true, false, true, String(result.railCount))}${field('Screws per plank', 'screwsPerPlank', order.screwsPerPlank, true, false, true, String(result.screwsPerPlank))}</div></details>`, 'The rate applies to the full contracted footage. Gate openings do not reduce the billed footage.');
    const footage = footageOf(order);
    const multiRun = order.runs.length > 1;
    const widthChoices = (index: number, selected: number) => gateWidthChoices.map((width) =>
      `<button class='choice ${selected === width ? 'is-selected' : ''}' type='button' data-action='gate-width' data-index='${index}' data-width='${width}'>${width} ft</button>`).join('');
    const gateCards = order.gates.map((gate, index) => box('Gate ' + (index + 1),
      `<div class='choice-row' role='group' aria-label='Gate width ${index + 1}'>${widthChoices(index, gate.widthFt)}</div>`
      + (gate.widthFt > 0 ? '' : `<p class='dash-muted'>Select a width for this gate.</p>`)
      + select('Type', `gates.${index}.kind`, gate.kind, [['plank','Plank gate'],['aluminum','Custom aluminum gate']])
      + select('Location', `gates.${index}.runId`, gate.runId, [['','Standalone gate'], ...order.runs.map((run): [string,string] => [run.id, run.name])])
      + field('Opening width, ft', `gates.${index}.widthFt`, gate.widthFt > 0 ? gate.widthFt : '', true)
      + field('Gate height, ft', `gates.${index}.heightFt`, gate.heightFt, true)
      + field('Offset from run start, ft', `gates.${index}.offsetFt`, gate.offsetFt, true)
      + field('Gate price, USD', `gates.${index}.priceCents`, gate.priceCents, true, true)
      + check('Included in price', `gates.${index}.included`, gate.included)
      + check('Separate gate posts', `gates.${index}.separatePosts`, gate.separatePosts)
      + check('Reinforce gate posts', `gates.${index}.reinforced`, gate.reinforced)
      + button('gate-price', 'Use catalog price', 'data-index=' + index), 'remove-gate', index)).join('');
    const job = card('Job details', `<div class='job-board'>
      <div class='job-tile job-tile-wide'><span class='job-kicker'>Fence footage</span><input class='footage-input' data-footage inputmode='decimal' type='number' min='0' step='0.01' placeholder='e.g., 200' aria-label='Contracted fence footage' value='${multiRun ? esc(footage) : footage > 0 ? esc(footage) : ''}' ${multiRun ? 'readonly' : ''} /><p class='dash-muted'>${multiRun ? 'Multiple runs are listed below. Edit each run to change the total.' : 'Enter the contracted footage. Gate openings do not reduce this number.'}</p></div>
      <div class='job-tile'><span class='job-kicker'>Gates</span>${stepper('gate-count', order.gates.length, 'Remove a gate', 'Add a gate')}<p class='dash-muted'>${order.gates.length ? order.gates.length + ' gate' + (order.gates.length === 1 ? '' : 's') + '. Select a width for each gate.' : 'No gates. Keep this at zero for a fence-only job.'}</p></div>
      <div class='job-tile'><span class='job-kicker'>Included cameras</span>${stepper('camera-count', order.cameras.included, 'Remove an included camera', 'Add an included camera')}<div class='choice-row'>${[0,1,2].map((count) => `<button class='choice ${order.cameras.included === count ? 'is-selected' : ''}' type='button' data-action='camera-count' data-count='${count}'>${count}</button>`).join('')}</div><p class='dash-muted'>Included cameras are part of this price.</p></div>
      </div>${gateCards}<details ${multiRun ? 'open' : ''}><summary>Runs, extra cameras, and corners</summary><div data-run-fields>${runCards()}</div>${button('add-run', 'Add run')}<div class='fields extra-cameras'>${field('Additional cameras', 'cameras.extra', order.cameras.extra, true)}${field('Additional camera price, USD', 'cameras.unitCents', order.cameras.unitCents, true, true, true, 'Enter price')}</div><p class='dash-muted'>Use the same point name for connected run ends that share a post. Set an offset for each gate in a run.</p></details>`,
      'Set the footage, gate count, and included cameras.');
    const items = card('Products and services', order.items.map((item, index) => box('Item ' + (index + 1),
      field('Customer-facing description', `items.${index}.description`, item.description)
      + field('Quantity', `items.${index}.quantity`, item.quantity, true)
      + field('Unit', `items.${index}.unit`, item.unit)
      + field('Unit price, USD', `items.${index}.unitCents`, item.unitCents, true, true)
      + check('Included in price', `items.${index}.included`, item.included), 'remove-item', index)).join('') + button('add-item', 'Add product or service'));
    const materials = card('Materials', (Object.keys(materialNames) as MaterialKey[]).map((key) =>
      `<div class='material-row ${Object.hasOwn(order.overrides,key) ? 'modified' : ''}' data-material='${key}'><label>${materialNames[key]}<small data-auto='${key}'>Calculated: ${result.automatic[key]}</small></label><input aria-label='${materialNames[key]}' type='number' min=0 step='${key === 'railFeet' ? '0.01' : '1'}' data-path='overrides.${key}' data-optional placeholder='${result.automatic[key]}' value='${order.overrides[key] ?? ''}' />${button('reset-material', 'Reset to calculated', 'data-key=' + key)}</div>`).join(''),
      'These quantities are included in the package. Add an item to charge for extras. Edited quantities stay in place until you reset them.');
    const pricing = card('Adjustments and terms', `<div class='fields'>${select('Discount', 'discount.kind', order.discount.kind, [['amount','Amount, USD'],['percent','Percent']])}${field('Discount value', 'discount.value', order.discount.value, true, order.discount.kind === 'amount')}${field('Charge description', 'charge.label', order.charge.label)}${field('Charge, percent', 'charge.percent', order.charge.percent, true)}${select('Deposit', 'deposit.kind', order.deposit.kind, [['percent','Percent of total'],['amount','Amount, USD']])}${field('Deposit value', 'deposit.value', order.deposit.value, true, order.deposit.kind === 'amount')}<label class='wide'>Customer terms<textarea data-path='terms' maxlength=4000>${esc(order.terms)}</textarea></label><label class='wide'>Internal notes, excluded from PDF<textarea data-path='internalNotes' maxlength=4000>${esc(order.internalNotes)}</textarea></label></div>`);
    node('[data-editor]').innerHTML = `<fieldset ${historical ? 'disabled' : ''}>${job + customer + dims + items + materials + pricing}</fieldset>`;
    if (focus) root.querySelector<HTMLInputElement>(focus)?.focus();
    const paymentForm = node<HTMLFormElement>('[data-payment-form]');
    paymentForm.hidden = historical || saved?.kind !== 'invoice';
    paymentForm.querySelector<HTMLInputElement>('input[name=date]')!.value ||= new Date().toISOString().slice(0,10);
    node('[data-payments]').innerHTML = (saved?.payments ?? []).map((payment) =>
      `<div class='payment-entry'><span>${esc(payment.date)} / ${esc(payment.method)}<small class='help'>${esc(payment.note)}</small></span><strong>${money(payment.amountCents)}</strong>${!historical && !payment.reverses && !saved?.payments.some((p) => p.reverses === payment.id) ? button('reverse-payment','Reverse','data-id=' + payment.id) : ''}</div>`).join('') || '<p class=\'dash-muted\'>No payments recorded.</p>';
    updateSummary();
  }
  function updateSummary(): void {
    const result = calculate(order, saved?.payments ?? []);
    const editor = node('[data-editor]').querySelector('fieldset');
    if (editor) editor.disabled = historical || busy;
    node('[data-payment-form]').querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach((element) => { element.disabled = historical || busy; });
    const row = (label: string, value: string, total = false) => `<div class='summary-line ${total ? 'summary-total' : ''}'><span>${label}</span><strong>${esc(value)}</strong></div>`;
    node('[data-summary]').innerHTML = row('Contracted footage', String(result.grossFt)) + row('Openings / solid fence', result.openingFt + ' / ' + result.netFt + ' ft')
      + row('Rate per foot', money(result.rateCents) + '/ft') + row('Subtotal', money(result.subtotalCents))
      + row('Discount', money(-result.discountCents)) + row(order.charge.label || 'Charge', money(result.chargeCents))
      + row('Total', money(result.totalCents), true) + row('Deposit', money(result.depositCents))
      + row('Payments received', money(result.paidCents)) + row('Balance due', money(result.balanceCents));
    node('[data-issues]').innerHTML = result.issues.map((issue) => '<li>' + esc(sellerMessage(issue)) + '</li>').join('');
    for (const [key, value] of Object.entries(jobSummaryValues(order, result))) {
      const target = root.querySelector('[data-job-' + key + ']');
      if (target) target.textContent = value;
    }
    syncFootageInputs(order, root.querySelector<HTMLInputElement>('[data-footage]'),
      order.runs.map((_, index) => root.querySelector<HTMLInputElement>("[data-path='runs." + index + ".lengthFt']")),
      document.activeElement);
    for (const key of Object.keys(materialNames) as MaterialKey[]) {
      const target = root!.querySelector<HTMLElement>('[data-auto=' + key + ']');
      if (target) target.textContent = 'Calculated: ' + result.automatic[key] + (Object.hasOwn(order.overrides,key) ? ' / edited' : '');
      const input = root!.querySelector<HTMLInputElement>('[data-path=\'overrides.' + key + '\']');
      if (input) input.placeholder = String(result.automatic[key]);
    }
    for (const action of ['save','convert','send','download','print']) {
      const target = root!.querySelector<HTMLButtonElement>('[data-action=' + action + ']')!;
      target.disabled = busy || Boolean(result.issues.length) || (historical && ['save','convert','send'].includes(action));
      if (action === 'convert') target.hidden = saved?.kind === 'invoice' || historical;
    }
    node('[data-version]').textContent = saved ? `Revision ${saved.version} / ${historical ? 'viewing history' : dirty ? 'unsaved changes' : 'saved'}` : 'Not saved';
    node('[data-save-note]').textContent = historical ? 'You are viewing an earlier revision. Duplicate it to make changes.' : !saved ? 'New estimate. Save to keep this document.' : dirty ? 'You have unsaved changes.' : 'Saved. Each update keeps a new revision.';
    schedulePreview();
  }
  function schedulePreview(): void {
    clearTimeout(previewTimer);
    previewAbort?.abort();
    const epoch = ++previewEpoch;
    if (calculate(order, saved?.payments ?? []).issues.length) {
      node('[data-preview-status]').textContent = 'Resolve the issues above to update the PDF.';
      node<HTMLIFrameElement>('[data-preview]').hidden = true; return;
    }
    previewTimer = setTimeout(async () => {
      previewAbort = new AbortController();
      try {
        const response = !dirty && saved
          ? await fetch('/api/invoices/' + saved.id + '/pdf?version=' + saved.version, { signal: previewAbort.signal, cache:'no-store' })
          : await fetch('/api/invoices/preview', { method:'POST', headers:{'content-type':'application/json'},
            body:JSON.stringify({order, id:saved?.id, version:saved?.version}), signal:previewAbort.signal });
        if (!response.ok) {
          const error = await response.json(); throw new Error(sellerMessage(error.message, error.error, 'PDF preview is unavailable.'));
        }
        const blob = await response.blob();
        if (epoch !== previewEpoch) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        const iframe = node<HTMLIFrameElement>('[data-preview]'); iframe.src = previewUrl; iframe.hidden = false;
        node('[data-preview-status]').textContent = dirty ? 'Draft preview. Downloading or sending saves this document first.' : 'This PDF is used for downloads, printing, and email.';
      } catch (error) {
        if (epoch === previewEpoch && !(error instanceof DOMException && error.name === 'AbortError')) {
          node('[data-preview-status]').textContent = sellerMessage(error instanceof Error ? error.message : undefined, undefined, 'PDF preview is unavailable.');
          node<HTMLIFrameElement>('[data-preview]').hidden = true;
        }
      }
    }, 650);
  }
  async function refreshList(more = false): Promise<void> {
    const requested = query;
    const result = await api('/search','POST',{query:requested.slice(0,100),before:more?cursor:0});
    if (requested !== query) return;
    const incoming = result.documents ?? [];
    rows = more ? rows.concat(incoming) : incoming;
    cursor = Number(incoming.at(-1)?.seq ?? 0);
    node('[data-documents]').innerHTML = rows.map((item) =>
      `<tr><td data-label='Document'>${esc(item.number)}<small>${item.kind === 'invoice' ? 'Invoice' : 'Estimate'} / Rev ${esc(item.version)}</small></td><td data-label='Customer'>${esc(item.customer_name)}</td><td data-label='Updated'>${esc(String(item.updated_at).slice(0,10))}</td><td data-label='Total'>${money(Number(item.total_cents))}</td><td data-label='Balance'>${money(Number(item.balance_cents))}</td><td>${button('open','Open','data-id=' + esc(item.id))}</td></tr>`).join('') || '<tr><td colspan=6>No documents found.</td></tr>';
    node('[data-action=more]').hidden = incoming.length < 50;
  }
  async function revisions(): Promise<void> {
    if (!saved) { node('[data-revisions]').textContent = 'No saved revisions.'; return; }
    const result = await api('/' + saved.id + '/history');
    node('[data-revisions]').innerHTML = (result.revisions ?? []).map((revision) =>
      `<div class='revision-entry'><span>Rev ${esc(revision.version)} / ${esc(String(revision.created_at).slice(0,16))}<small class='help'>${esc(revision.actor)}${revision.send_state ? ' / Email: ' + esc(revision.send_state) : ''}</small></span>${button('revision','View','data-version=' + esc(revision.version))}</div>`).join('');
  }
  async function open(id: string, version?: number): Promise<void> {
    if (dirty && !window.confirm('Discard unsaved changes and open this document?')) return;
    busy = true; updateSummary();
    try {
      const result = await api('/' + id + (version ? '?version=' + version : ''));
      if (!result.document) throw new Error('No document was received. Your edits are still in the editor.');
      saved = result.document; order = structuredClone(saved.order); dirty = false; historical = Boolean(version);
      resetDraftIdentity();
      render(); await revisions(); status(historical ? 'Viewing an earlier revision.' : 'Document loaded.');
    } finally { busy = false; updateSummary(); }
  }
  async function save(): Promise<StoredInvoice> {
    if (historical) throw new Error('Earlier revisions are read-only. Duplicate one to make changes.');
    if (saved && !dirty) return saved;
    if (!saved) {
      const desired = structuredClone(order), firstAttempt = pendingCreation === null;
      const initial = pendingCreation ?? structuredClone(order);
      pendingCreation = initial; dirty = true;
      let created: StoredInvoice;
      try {
        const result = await api('','POST',{ creationKey,order:initial });
        const confirmed = result.document;
        if (!confirmed || confirmed.id !== creationKey || confirmed.version !== 1) {
          throw new Error('Creation could not be confirmed. Retry to recover the same document.');
        }
        created = confirmed;
      } catch (error) {
        // Only a first, explicit client rejection proves this payload was not committed.
        // Keep the key; an earlier ambiguous attempt must retain its original payload.
        if (firstAttempt && error instanceof InvoiceRequestError && error.status >= 400 && error.status < 500 && error.status !== 409) {
          pendingCreation = null;
        }
        throw error;
      }
      saved = created; pendingCreation = null;
      dirty = JSON.stringify(desired) !== JSON.stringify(initial);
      order = dirty ? desired : structuredClone(created.order);
      // If the following PUT fails, keep the recovered identity and current edits.
      if (dirty) render();
    }
    if (dirty) {
      const result = await api('/' + saved.id,'PUT',{ version:saved.version,order });
      if (!result.document) throw new Error('The revision was not confirmed. Your edits are still in the editor.');
      saved = result.document; order = structuredClone(saved.order); dirty = false;
    }
    render(); await Promise.all([refreshList(), revisions()]); return saved;
  }
  async function perform(action: string, target: HTMLElement): Promise<void> {
    if (busy) return;
    if (action === 'new') {
      if (dirty && !window.confirm('Discard unsaved changes?')) return;
      order = newOrder(); saved = null; resetDraftIdentity(); dirty = false; historical = false; render(); await revisions(); status('New estimate.'); return;
    }
    if (action === 'duplicate') { order = structuredClone(order); saved = null; resetDraftIdentity(); dirty = true; historical = false; render(); await revisions(); status('New copy created. Payments were not copied.'); return; }
    if (action === 'open') { await open(target.dataset.id!); return; }
    if (action === 'revision') { if(saved) await open(saved.id, Number(target.dataset.version)); return; }
    if (action === 'more') { await refreshList(true); return; }
    if (historical && !['download','print'].includes(action)) return;
    const index = Number(target.dataset.index);
    if (action === 'add-run') {
      const used = new Set(order.runs.flatMap((run) => [run.startNode,run.endNode])); let n = 1;
      while(used.has('P' + n)) n += 1;
      const startNode = order.runs.at(-1)?.endNode ?? 'P' + n++;
      while(used.has('P' + n) || 'P' + n === startNode) n += 1;
      order.runs.push({id:crypto.randomUUID(),name:'Run ' + (order.runs.length + 1),lengthFt:0,startNode,endNode:'P' + n});
    } else if (action === 'gate-count' || action === 'add-gate') {
      const absolute = target.dataset.count;
      setGateCount(order, absolute !== undefined ? Number(absolute) : order.gates.length + Number(target.dataset.delta || 1));
    } else if (action === 'camera-count') {
      const absolute = target.dataset.count;
      setIncludedCameras(order, absolute !== undefined ? Number(absolute) : order.cameras.included + Number(target.dataset.delta || 0));
    } else if (action === 'gate-width') {
      const gate = order.gates[index];
      if (!gate) return;
      gate.widthFt = Number(target.dataset.width);
      const price = gateDefault(gate.widthFt, gate.kind, order.labor);
      if (price !== null) gate.priceCents = price;
      if (order.runs.length === 1 && gate.widthFt > 0 && gate.widthFt <= order.runs[0].lengthFt) {
        gate.runId = order.runs[0].id;
        if (gate.offsetFt + gate.widthFt > order.runs[0].lengthFt) gate.offsetFt = 0;
      }
    } else if (action === 'add-item') order.items.push({id:crypto.randomUUID(),description:'',quantity:1,unit:'unit',unitCents:0,included:false});
    else if (action === 'remove-run') {
      const [removed] = order.runs.splice(index,1);
      order.gates.filter((gate) => gate.runId === removed.id).forEach((gate) => {gate.runId='';gate.offsetFt=0;});
    } else if (action === 'remove-gate') order.gates.splice(index,1);
    else if (action === 'remove-item') order.items.splice(index,1);
    else if (action === 'reset-rate') order.rateCents = null;
    else if (action === 'reset-material') delete order.overrides[target.dataset.key as MaterialKey];
    else if (action === 'gate-price') {
      const gate = order.gates[index], price = gateDefault(gate.widthFt,gate.kind,order.labor);
      if (price === null) throw new Error('No catalog price is available for that width. Enter a price.');
      gate.priceCents = price;
    } else {
      const popup = action === 'print' ? window.open('about:blank','_blank') : null;
      busy=true; updateSummary();
      try {
        if (action === 'send' && !window.confirm('Email this document to the customer with a copy to the business?')) return;
        const current = historical && saved ? saved : await save();
        if (action === 'save') status('Document saved.');
        else if (action === 'convert') {
          if (!window.confirm('Has the customer accepted this estimate?')) return;
          const result=await api('/'+current.id+'/convert','POST',{version:current.version});
          saved=result.document!; order=structuredClone(saved.order); dirty=false; render(); await Promise.all([refreshList(),revisions()]); status('Invoice created. The original estimate remains in history.');
        } else if (action === 'send') {
          const result=await api('/'+current.id+'/send','POST',{version:current.version}); status(result.message!); await revisions();
        } else if (action === 'download' || action === 'print') {
          const url='/api/invoices/'+current.id+'/pdf?version='+current.version+(action==='download'?'&download=1':'');
          if (action === 'print' && !popup) throw new Error('Allow the PDF window to open for printing.');
          const blob = await fetchInvoicePdf(url);
          const blobUrl = URL.createObjectURL(blob);
          if (action === 'print' && popup) {
            popup.opener=null; popup.location.href=blobUrl; status('Print from the PDF viewer at actual size.');
          } else {
            const link=document.createElement('a'); link.href=blobUrl; link.download=current.number+'.pdf'; link.click();
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
        }
      } catch(error) { popup?.close(); throw error; }
      finally { busy=false; updateSummary(); }
      return;
    }
    dirty=true; render();
  }
  root.addEventListener('click',(event) => {
    const target=(event.target as Element).closest<HTMLElement>('[data-action]');
    if(target && target.dataset.action !== 'reverse-payment') { event.preventDefault(); void perform(target.dataset.action!,target).catch((error) => status(error.message,true)); }
  });
  node<HTMLFormElement>('[data-editor]').addEventListener('submit',(event) => event.preventDefault());
  node('[data-editor]').addEventListener('input',(event) => {
    if (historical || busy) return;
    const target=event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const path=target.dataset.path;
    if (target instanceof HTMLInputElement && target.hasAttribute('data-footage')) {
      editFootage(order, target, (createdRun) => {
        dirty = true;
        if (createdRun) {
          // Only mount the new advanced row. The active footage input and next click target stay connected.
          node('[data-run-fields]').innerHTML = runCards();
          root.querySelectorAll<HTMLSelectElement>('select[data-path]').forEach((select) => {
            if (!/^gates\.\d+\.runId$/.test(select.dataset.path ?? '')) return;
            const option = document.createElement('option');
            option.value = order.runs[0].id; option.textContent = order.runs[0].name;
            select.append(option);
          });
        }
        updateSummary();
      });
      return;
    }
    if(!path) return;
    const parts=path.split('.'); let parent=order as unknown as Record<string,unknown>;
    for(const part of parts.slice(0,-1)) parent=parent[part] as Record<string,unknown>;
    const key=parts.at(-1)!;
    let value: unknown=target.value;
    if(target instanceof HTMLInputElement && target.type==='checkbox') value=target.checked;
    else if(target instanceof HTMLInputElement && target.type==='number') {
      value=target.value==='' && target.hasAttribute('data-optional') ? null : Number(target.value);
      if(value!==null && target.hasAttribute('data-cents')) value=Math.round(Number(value)*100);
    }
    if(path.startsWith('overrides.') && value===null) delete parent[key]; else parent[key]=value;
    if(path==='discount.kind') order.discount.value=0;
    if(path==='deposit.kind') order.deposit.value=order.deposit.kind==='percent'?25:0;
    if(/^gates\.\d+\.(widthFt|kind)$/.test(path)) {
      const gate = order.gates[Number(parts[1])];
      const price = gate ? gateDefault(gate.widthFt, gate.kind, order.labor) : null;
      if (gate && price !== null) gate.priceCents = price;
      if (gate && order.runs.length === 1 && gate.widthFt > 0 && gate.widthFt <= order.runs[0].lengthFt && !gate.runId) gate.runId = order.runs[0].id;
    }
    dirty=true;
    if(path==='discount.kind'||path==='deposit.kind'||path==='packageId'||path==='labor'||/^gates\.\d+\.kind$/.test(path)) render(); else updateSummary();
  });
  node<HTMLInputElement>('[data-search]').addEventListener('input',(event) => {
    query=(event.target as HTMLInputElement).value; clearTimeout(searchTimer);
    searchTimer=setTimeout(() => void refreshList().catch((error) => status(error.message,true)),350);
  });
  node<HTMLFormElement>('[data-payment-form]').addEventListener('submit',(event) => {
    event.preventDefault(); if(busy||historical||!saved) return;
    const form=event.currentTarget as HTMLFormElement, data=new FormData(form);
    busy=true; updateSummary();
    void (async () => {
      const current=await save();
      const result=await api('/'+current.id+'/payments','POST',{version:current.version,amountCents:Math.round(Number(data.get('amount'))*100),date:data.get('date'),method:data.get('method'),note:data.get('note')});
      saved=result.document!; order=structuredClone(saved.order); dirty=false; form.reset(); render();
      await Promise.all([refreshList(),revisions()]); status('Payment recorded.');
    })().catch((error) => status(error.message,true)).finally(() => {busy=false;updateSummary();});
  });
  root.addEventListener('click',(event) => {
    const target=(event.target as Element).closest<HTMLElement>('[data-action=reverse-payment]');
    if(!target||!saved||busy||historical) return;
    if(!window.confirm('Reverse this payment and retain the original entry in history?')) return;
    busy=true;
    void (async () => {
      const current=await save();
      const result=await api('/'+current.id+'/payments','POST',{version:current.version,reverses:target.dataset.id,date:new Date().toISOString().slice(0,10),method:'Reversal',note:'Payment reversed by seller'});
      saved=result.document!; order=structuredClone(saved.order); dirty=false; render();
      await Promise.all([refreshList(),revisions()]); status('Payment reversed. The original entry remains in history.');
    })().catch((error) => status(error.message,true)).finally(() => {busy=false;updateSummary();});
  });
  window.addEventListener('beforeunload',(event) => { if(dirty && (saved||pendingCreation||order.runs.length||order.gates.length||order.items.length||order.customer.name)) {event.preventDefault();event.returnValue='';} });
  render();
  void refreshList().then(() => status('Workspace ready. Open a document or create a new estimate.')).catch((error) => status(error.message,true));
}

