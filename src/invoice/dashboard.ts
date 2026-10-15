import { newOrder, calculate, gateDefault, money, type Order, type StoredInvoice, type MaterialKey } from './model.ts';
const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
const percent = String.fromCharCode(37);
const materialNames: Record<MaterialKey, string> = {
  posts: 'Postes totales', reinforcedPosts: 'Reforzados, dentro del total', railFeet: 'Rieles de cerca, pies lineales',
  fencePlanks: 'Planks de cerca', gatePlanks: 'Planks de gates', screws: 'Tornillos',
};
class InvoiceRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
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
    const target = node('[data-status]'); target.textContent = message; target.dataset.error = String(error);
  };
  const api = async (path: string, method = 'GET', data?: unknown) => {
    const response = await fetch('/api/invoices' + path, {
      method, credentials: 'same-origin', cache: 'no-store',
      ...(data === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
    });
    let result: { ok: boolean; message?: string; document?: StoredInvoice; documents?: Record<string, unknown>[]; revisions?: Record<string, unknown>[] };
    try { result = await response.json(); } catch { throw new Error('No se pudo leer la respuesta. Comprueba tu sesion y la conexion.'); }
    if (!response.ok || !result.ok) throw new InvoiceRequestError(result.message ?? 'No se pudo completar la operacion.',response.status);
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
    `<div class='row-box'><div class='row-title'><h3>${title}</h3>${button(remove, 'Quitar', 'data-index=' + index)}</div><div class='fields'>${content}</div></div>`;

  function render(): void {
    const result = calculate(order, saved?.payments ?? []);
    node('[data-kind]').textContent = saved?.kind === 'invoice' ? 'Invoice' : 'Estimado';
    node('[data-number]').textContent = saved?.number ?? 'Nuevo documento';
    node('[data-version]').textContent = saved ? `Revision ${saved.version} / ${historical ? 'consulta del historial' : dirty ? 'cambios sin guardar' : 'guardado'}` : 'Sin guardar';
    const customer = card('1. Cliente y proyecto', `<div class='fields'>${field('Cliente / empresa', 'customer.name', order.customer.name)}${field('Telefono', 'customer.phone', order.customer.phone)}${field('Email del cliente', 'customer.email', order.customer.email)}${field('Direccion del proyecto', 'customer.address', order.customer.address)}</div>`);
    const dims = card('2. Cerca y acuerdo', `<div class='fields'>${select('Paquete', 'packageId', order.packageId, [['standard','Standard'],['premium','Premium']])}${select('Servicio', 'labor', order.labor, [['installed','Instalacion'],['materials','Solo materiales']])}${field('Precio negociado por pie, USD', 'rateCents', order.rateCents, true, true, true, String(result.rateCents / 100))}${field('Altura de cerca, pies', 'heightFt', order.heightFt, true)}${field('Profundidad del poste, pies', 'embedFt', order.embedFt, true)}</div>${button('reset-rate', 'Usar precio del paquete')}<details><summary>Configuracion de materiales</summary><div class='fields'>${field('Separacion de postes, pies', 'spacingFt', order.spacingFt, true, false, true, String(result.spacingFt))}${field('Rieles por seccion', 'railCount', order.railCount, true, false, true, String(result.railCount))}${field('Tornillos por plank', 'screwsPerPlank', order.screwsPerPlank, true, false, true, String(result.screwsPerPlank))}</div></details>`, 'La tarifa se aplica a todos los pies contratados. Las aberturas solo reducen los materiales de cerca.');
    const runs = card('Tramos de cerca', order.runs.map((run, index) => box('Tramo ' + (index + 1),
      field('Nombre del tramo', `runs.${index}.name`, run.name) + field('Longitud total, pies', `runs.${index}.lengthFt`, run.lengthFt, true)
      + field('Punto inicial', `runs.${index}.startNode`, run.startNode) + field('Punto final', `runs.${index}.endNode`, run.endNode), 'remove-run', index)).join('') + button('add-run', 'Agregar tramo'),
      'Usa el mismo nombre de punto en los extremos que comparten un poste. Ejemplo: frente P1-P2 y lateral P2-P3.');
    const gates = card('3. Gates', order.gates.map((gate, index) => box('Gate ' + (index + 1),
      select('Tipo', `gates.${index}.kind`, gate.kind, [['plank','Gate revestido con planks'],['aluminum','Custom aluminium gate']])
      + select('Ubicacion', `gates.${index}.runId`, gate.runId, [['','Independiente del proyecto'], ...order.runs.map((run): [string,string] => [run.id, run.name])])
      + field('Ancho de abertura, pies', `gates.${index}.widthFt`, gate.widthFt, true)
      + field('Altura del gate, pies', `gates.${index}.heightFt`, gate.heightFt, true)
      + field('Distancia desde inicio del tramo, pies', `gates.${index}.offsetFt`, gate.offsetFt, true)
      + field('Precio del gate, USD', `gates.${index}.priceCents`, gate.priceCents, true, true)
      + check('Incluido en el acuerdo', `gates.${index}.included`, gate.included)
      + check('Postes propios separados', `gates.${index}.separatePosts`, gate.separatePosts)
      + check('Reforzar postes del gate', `gates.${index}.reinforced`, gate.reinforced)
      + button('gate-price', 'Cargar precio de catalogo', 'data-index=' + index), 'remove-gate', index)).join('')
      + button('add-gate', 'Agregar gate'), 'Un gate incluido conserva sus materiales y muestra Included en el invoice. Los aluminium gates no agregan planks.');
    const cameras = card('Camaras', `<div class='fields'>${field('Camaras incluidas', 'cameras.included', order.cameras.included, true)}${field('Camaras adicionales cobradas', 'cameras.extra', order.cameras.extra, true)}${field('Precio de cada camara adicional, USD', 'cameras.unitCents', order.cameras.unitCents, true, true, true, 'Introduce el precio acordado')}</div>`);
    const items = card('Productos y servicios adicionales', order.items.map((item, index) => box('Partida ' + (index + 1),
      field('Descripcion para el cliente', `items.${index}.description`, item.description)
      + field('Cantidad', `items.${index}.quantity`, item.quantity, true)
      + field('Unidad', `items.${index}.unit`, item.unit)
      + field('Precio unitario, USD', `items.${index}.unitCents`, item.unitCents, true, true)
      + check('Incluido en el acuerdo', `items.${index}.included`, item.included), 'remove-item', index)).join('') + button('add-item', 'Agregar producto o servicio'));
    const materials = card('Materiales del proyecto', (Object.keys(materialNames) as MaterialKey[]).map((key) =>
      `<div class='material-row ${Object.hasOwn(order.overrides,key) ? 'modified' : ''}' data-material='${key}'><label>${materialNames[key]}<small data-auto='${key}'>Calculado: ${result.automatic[key]}</small></label><input aria-label='${materialNames[key]}' type='number' min=0 step='${key === 'railFeet' ? '0.01' : '1'}' data-path='overrides.${key}' data-optional placeholder='${result.automatic[key]}' value='${order.overrides[key] ?? ''}' />${button('reset-material', 'Automatico', 'data-key=' + key)}</div>`).join(''),
      'Estas cantidades estan dentro del paquete. Para cobrar extras, agrega una partida. Los valores corregidos se mantienen hasta pulsar Automatico.');
    const pricing = card('4. Importes y condiciones', `<div class='fields'>${select('Descuento', 'discount.kind', order.discount.kind, [['amount','Importe USD'],['percent','Porcentaje']])}${field('Valor del descuento', 'discount.value', order.discount.value, true, order.discount.kind === 'amount')}${field('Concepto del cargo', 'charge.label', order.charge.label)}${field('Cargo, porcentaje', 'charge.percent', order.charge.percent, true)}${select('Deposito', 'deposit.kind', order.deposit.kind, [['percent','Porcentaje del total'],['amount','Importe USD']])}${field('Valor del deposito', 'deposit.value', order.deposit.value, true, order.deposit.kind === 'amount')}<label class='wide'>Condiciones para el cliente<textarea data-path='terms' maxlength=4000>${esc(order.terms)}</textarea></label><label class='wide'>Notas internas, no aparecen en el PDF<textarea data-path='internalNotes' maxlength=4000>${esc(order.internalNotes)}</textarea></label></div>`);
    node('[data-editor]').innerHTML = `<fieldset ${historical ? 'disabled' : ''}>${customer + dims + runs + gates + cameras + items + materials + pricing}</fieldset>`;
    const paymentForm = node<HTMLFormElement>('[data-payment-form]');
    paymentForm.hidden = historical || saved?.kind !== 'invoice';
    paymentForm.querySelector<HTMLInputElement>('input[name=date]')!.value ||= new Date().toISOString().slice(0,10);
    node('[data-payments]').innerHTML = (saved?.payments ?? []).map((payment) =>
      `<div class='payment-entry'><span>${esc(payment.date)} / ${esc(payment.method)}<small class='help'>${esc(payment.note)}</small></span><strong>${money(payment.amountCents)}</strong>${!historical && !payment.reverses && !saved?.payments.some((p) => p.reverses === payment.id) ? button('reverse-payment','Anular','data-id=' + payment.id) : ''}</div>`).join('') || '<p class=\'dash-muted\'>No hay pagos registrados.</p>';
    updateSummary();
  }
  function updateSummary(): void {
    const result = calculate(order, saved?.payments ?? []);
    const editor = node('[data-editor]').querySelector('fieldset');
    if (editor) editor.disabled = historical || busy;
    node('[data-payment-form]').querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach((element) => { element.disabled = historical || busy; });
    const row = (label: string, value: string, total = false) => `<div class='summary-line ${total ? 'summary-total' : ''}'><span>${label}</span><strong>${esc(value)}</strong></div>`;
    node('[data-summary]').innerHTML = row('Pies contratados', String(result.grossFt)) + row('Aberturas / cerca efectiva', result.openingFt + ' / ' + result.netFt + ' ft')
      + row('Tarifa acordada', money(result.rateCents) + '/ft') + row('Subtotal', money(result.subtotalCents))
      + row('Descuento', money(-result.discountCents)) + row(order.charge.label || 'Cargo', money(result.chargeCents))
      + row('Total', money(result.totalCents), true) + row('Deposito acordado', money(result.depositCents))
      + row('Pagos recibidos', money(result.paidCents)) + row('Saldo pendiente', money(result.balanceCents));
    node('[data-issues]').innerHTML = result.issues.map((issue) => '<li>' + esc(issue) + '</li>').join('');
    for (const key of Object.keys(materialNames) as MaterialKey[]) {
      const target = root!.querySelector<HTMLElement>('[data-auto=' + key + ']');
      if (target) target.textContent = 'Calculado: ' + result.automatic[key] + (Object.hasOwn(order.overrides,key) ? ' / modificado' : '');
      const input = root!.querySelector<HTMLInputElement>('[data-path=\'overrides.' + key + '\']');
      if (input) input.placeholder = String(result.automatic[key]);
    }
    for (const action of ['save','convert','send','download','print']) {
      const target = root!.querySelector<HTMLButtonElement>('[data-action=' + action + ']')!;
      target.disabled = busy || Boolean(result.issues.length) || (historical && ['save','convert','send'].includes(action));
      if (action === 'convert') target.hidden = saved?.kind === 'invoice' || historical;
    }
    node('[data-version]').textContent = saved ? `Revision ${saved.version} / ${historical ? 'consulta del historial' : dirty ? 'cambios sin guardar' : 'guardado'}` : 'Sin guardar';
    node('[data-save-note]').textContent = historical ? 'Estas consultando una revision anterior. Crea una copia para reutilizarla.' : !saved ? 'Nuevo estimado. Guarda el documento para conservarlo.' : dirty ? 'Tienes cambios sin guardar.' : 'Documento guardado. Cada cambio conserva una revision.';
    schedulePreview();
  }
  function schedulePreview(): void {
    clearTimeout(previewTimer);
    previewAbort?.abort();
    const epoch = ++previewEpoch;
    if (calculate(order, saved?.payments ?? []).issues.length) {
      node('[data-preview-status]').textContent = 'Corrige los datos para actualizar el PDF.';
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
          const error = await response.json(); throw new Error(error.message ?? 'Vista previa no disponible.');
        }
        const blob = await response.blob();
        if (epoch !== previewEpoch) return;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        const iframe = node<HTMLIFrameElement>('[data-preview]'); iframe.src = previewUrl; iframe.hidden = false;
        node('[data-preview-status]').textContent = dirty ? 'Borrador. La descarga y el envio guardan primero el documento.' : 'Este mismo PDF se descarga, imprime y envia.';
      } catch (error) {
        if (epoch === previewEpoch && !(error instanceof DOMException && error.name === 'AbortError')) {
          node('[data-preview-status]').textContent = error instanceof Error ? error.message : 'Vista previa no disponible.';
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
      `<tr><td>${esc(item.number)}<small>${item.kind === 'invoice' ? 'Invoice' : 'Estimado'} / Rev ${esc(item.version)}</small></td><td>${esc(item.customer_name)}</td><td>${esc(String(item.updated_at).slice(0,10))}</td><td>${money(Number(item.total_cents))}</td><td>${money(Number(item.balance_cents))}</td><td>${button('open','Abrir','data-id=' + esc(item.id))}</td></tr>`).join('') || '<tr><td colspan=6>No hay documentos.</td></tr>';
    node('[data-action=more]').hidden = incoming.length < 50;
  }
  async function revisions(): Promise<void> {
    if (!saved) { node('[data-revisions]').textContent = 'Sin revisiones guardadas.'; return; }
    const result = await api('/' + saved.id + '/history');
    node('[data-revisions]').innerHTML = (result.revisions ?? []).map((revision) =>
      `<div class='revision-entry'><span>Rev ${esc(revision.version)} / ${esc(String(revision.created_at).slice(0,16))}<small class='help'>${esc(revision.actor)}${revision.send_state ? ' / correo: ' + esc(revision.send_state) : ''}</small></span>${button('revision','Ver','data-version=' + esc(revision.version))}</div>`).join('');
  }
  async function open(id: string, version?: number): Promise<void> {
    if (dirty && !window.confirm('Descartar los cambios sin guardar para abrir este documento?')) return;
    busy = true; updateSummary();
    try {
      const result = await api('/' + id + (version ? '?version=' + version : ''));
      if (!result.document) throw new Error('No se recibio el documento. Tus cambios siguen en el editor.');
      saved = result.document; order = structuredClone(saved.order); dirty = false; historical = Boolean(version);
      resetDraftIdentity();
      render(); await revisions(); status(historical ? 'Revision anterior en modo consulta.' : 'Documento cargado.');
    } finally { busy = false; updateSummary(); }
  }
  async function save(): Promise<StoredInvoice> {
    if (historical) throw new Error('Una revision anterior solo se puede consultar o copiar.');
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
          throw new Error('No se pudo confirmar la creacion. Reintenta para recuperar el mismo documento.');
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
      if (!result.document) throw new Error('No se confirmo la revision. Tus cambios siguen en el editor.');
      saved = result.document; order = structuredClone(saved.order); dirty = false;
    }
    render(); await Promise.all([refreshList(), revisions()]); return saved;
  }
  async function perform(action: string, target: HTMLElement): Promise<void> {
    if (busy) return;
    if (action === 'new') {
      if (dirty && !window.confirm('Descartar los cambios sin guardar?')) return;
      order = newOrder(); saved = null; resetDraftIdentity(); dirty = false; historical = false; render(); await revisions(); status('Nuevo estimado.'); return;
    }
    if (action === 'duplicate') { order = structuredClone(order); saved = null; resetDraftIdentity(); dirty = true; historical = false; render(); await revisions(); status('Copia nueva, sin pagos del documento original.'); return; }
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
      order.runs.push({id:crypto.randomUUID(),name:'Tramo ' + (order.runs.length + 1),lengthFt:0,startNode,endNode:'P' + n});
    } else if (action === 'add-gate') order.gates.push({id:crypto.randomUUID(),kind:'plank',widthFt:12,heightFt:order.heightFt,runId:order.runs[0]?.id ?? '',offsetFt:0,included:true,priceCents:100000,separatePosts:false,reinforced:false});
    else if (action === 'add-item') order.items.push({id:crypto.randomUUID(),description:'',quantity:1,unit:'unit',unitCents:0,included:false});
    else if (action === 'remove-run') {
      const [removed] = order.runs.splice(index,1);
      order.gates.filter((gate) => gate.runId === removed.id).forEach((gate) => {gate.runId='';gate.offsetFt=0;});
    } else if (action === 'remove-gate') order.gates.splice(index,1);
    else if (action === 'remove-item') order.items.splice(index,1);
    else if (action === 'reset-rate') order.rateCents = null;
    else if (action === 'reset-material') delete order.overrides[target.dataset.key as MaterialKey];
    else if (action === 'gate-price') {
      const gate = order.gates[index], price = gateDefault(gate.widthFt,gate.kind,order.labor);
      if (price === null) throw new Error('No existe precio de catalogo para ese ancho. Introduce el importe negociado.');
      gate.priceCents = price;
    } else {
      const popup = action === 'print' ? window.open('about:blank','_blank') : null;
      busy=true; updateSummary();
      try {
        if (action === 'send' && !window.confirm('Enviar este documento al cliente por email, con copia al negocio?')) return;
        const current = historical && saved ? saved : await save();
        if (action === 'save') status('Documento guardado.');
        else if (action === 'convert') {
          if (!window.confirm('Confirmas que el cliente acepto este estimado?')) return;
          const result=await api('/'+current.id+'/convert','POST',{version:current.version});
          saved=result.document!; order=structuredClone(saved.order); dirty=false; render(); await Promise.all([refreshList(),revisions()]); status('Invoice creado. El estimado original sigue en el historial.');
        } else if (action === 'send') {
          const result=await api('/'+current.id+'/send','POST',{version:current.version}); status(result.message!); await revisions();
        } else if (action === 'download' || action === 'print') {
          const url='/api/invoices/'+current.id+'/pdf?version='+current.version+(action==='download'?'&download=1':'');
          if (action === 'print') {
            if (!popup) throw new Error('Permite abrir la ventana del PDF para imprimir.');
            popup.opener=null; popup.location.href=url; status('Imprime desde el visor del PDF a tamano real.');
          } else { const link=document.createElement('a'); link.href=url; link.download=current.number+'.pdf'; link.click(); }
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
    const path=target.dataset.path; if(!path) return;
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
    dirty=true;
    if(path==='discount.kind'||path==='deposit.kind'||path==='packageId'||path==='labor') render(); else updateSummary();
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
      await Promise.all([refreshList(),revisions()]); status('Pago registrado.');
    })().catch((error) => status(error.message,true)).finally(() => {busy=false;updateSummary();});
  });
  root.addEventListener('click',(event) => {
    const target=(event.target as Element).closest<HTMLElement>('[data-action=reverse-payment]');
    if(!target||!saved||busy||historical) return;
    if(!window.confirm('Anular este pago conservando su registro en el historial?')) return;
    busy=true;
    void (async () => {
      const current=await save();
      const result=await api('/'+current.id+'/payments','POST',{version:current.version,reverses:target.dataset.id,date:new Date().toISOString().slice(0,10),method:'Reversal',note:'Payment reversed by seller'});
      saved=result.document!; order=structuredClone(saved.order); dirty=false; render();
      await Promise.all([refreshList(),revisions()]); status('Pago anulado con registro de reversa.');
    })().catch((error) => status(error.message,true)).finally(() => {busy=false;updateSummary();});
  });
  window.addEventListener('beforeunload',(event) => { if(dirty && (saved||pendingCreation||order.runs.length||order.gates.length||order.items.length||order.customer.name)) {event.preventDefault();event.returnValue='';} });
  render();
  void refreshList().then(() => status('Dashboard listo. Selecciona un documento o prepara un nuevo estimado.')).catch((error) => status(error.message,true));
}

