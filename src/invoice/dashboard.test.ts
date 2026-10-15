import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editFootage, syncFootageInputs, fetchInvoicePdf, sellerMessage, jobSummaryValues } from './dashboard.ts';
import { calculate, newOrder, money } from './model.ts';
import { setIncludedCameras, setGateCount } from './job-setup.ts';

/** Value ports test the controller; browser focus/event ordering is checked separately. */
function input(initial = '') {
  let raw = initial, writes = 0;
  return {
    get value() { return raw; },
    set value(value: string) { writes += 1; raw = value; },
    readOnly: false,
    type(value: string) { raw = value; },
    get writes() { return writes; },
  };
}

test('first footage entry accepts all keystrokes through 200.5 without rewriting the active input', () => {
  const order = newOrder();
  order.rateCents = 3000;
  const primary = input(), advanced = input();
  const created: boolean[] = [];
  for (const raw of ['2', '20', '200', '200.', '200.5']) {
    primary.type(raw);
    assert.equal(editFootage(order, primary, (newRun) => {
      created.push(newRun);
      syncFootageInputs(order, primary, [advanced], primary);
    }), true);
    assert.equal(primary.value, raw);
    assert.equal(primary.writes, 0);
    assert.equal(advanced.value, String(order.runs[0].lengthFt));
  }
  assert.deepEqual(created, [true, false, false, false, false]);
  assert.equal(order.runs[0].name, 'Fence');
  assert.equal(order.runs.length, 1);
  assert.equal(order.runs[0].lengthFt, 200.5);
  const result = calculate(order);
  assert.equal(result.grossFt, 200.5);
  assert.equal(result.subtotalCents, 601500);
  // Subsequent job actions use the completed length, without a blur-time render.
  setIncludedCameras(order, 2);
  setGateCount(order, 0);
  assert.equal(order.cameras.included, 2);
  assert.equal(order.gates.length, 0);
  assert.equal(order.runs[0].lengthFt, 200.5);
});

test('deleting and retyping a decimal keeps the same single run and preserves blank input', () => {
  const order = newOrder(), primary = input(), advanced = input();
  let mounts = 0;
  const enter = (raw: string) => {
    primary.type(raw);
    editFootage(order, primary, (created) => {
      if (created) mounts += 1;
      syncFootageInputs(order, primary, [advanced], primary);
    });
  };
  enter('');
  assert.equal(order.runs.length, 0);
  enter('200');
  const id = order.runs[0].id;
  for (const raw of ['20', '2', '', '0.', '0.5', '200.5']) {
    enter(raw);
    assert.equal(primary.value, raw);
    assert.equal(primary.writes, 0);
    assert.equal(order.runs[0].id, id);
  }
  enter('');
  assert.equal(advanced.value, '0');
  assert.equal(order.runs[0].lengthFt, 0);
  assert.equal(order.runs.length, 1);
  assert.equal(mounts, 1);
  assert.equal(order.gates.length, 0);
});

test('advanced run edits synchronize primary footage without normalizing the active run text', () => {
  const order = newOrder(), primary = input('40'), advanced = input('40');
  editFootage(order, primary, () => {});
  for (const [raw, length] of [['200.', 200], ['200.5', 200.5], ['', 0]] as const) {
    advanced.type(raw);
    order.runs[0].lengthFt = length; // Existing generic data-path input handler.
    syncFootageInputs(order, primary, [advanced], advanced);
    assert.equal(advanced.value, raw);
    assert.equal(advanced.writes, 0);
    assert.equal(primary.value, length ? String(length) : '');
  }
  assert.equal(primary.readOnly, false);
});

test('multiple runs remain readonly and reject primary edits without refreshing or mutating runs', () => {
  const order = newOrder();
  order.runs = [
    { id: 'a', name: 'Front', lengthFt: 40, startNode: 'a', endNode: 'b' },
    { id: 'b', name: 'Side', lengthFt: 20.5, startNode: 'b', endNode: 'c' },
  ];
  const snapshot = structuredClone(order.runs);
  const primary = input('999'), front = input('40'), side = input('20.5');
  assert.equal(editFootage(order, primary, () => assert.fail('readonly input must not refresh')), false);
  assert.deepEqual(order.runs, snapshot);
  syncFootageInputs(order, primary, [front, side], null);
  assert.equal(primary.value, '60.5');
  assert.equal(primary.readOnly, true);
  side.type('25.');
  order.runs[1].lengthFt = 25;
  syncFootageInputs(order, primary, [front, side], side);
  assert.equal(primary.value, '65');
  assert.equal(side.value, '25.');
  order.runs.pop();
  syncFootageInputs(order, primary, [front], null);
  assert.equal(primary.value, '40');
  assert.equal(primary.readOnly, false);
});

test('PDF fetch surfaces 422 before any viewer or download receives a blob', async (t) => {
  const fetched = t.mock.method(globalThis,'fetch',async (_url, options) => {
    assert.equal(options?.credentials,'same-origin'); assert.equal(options?.cache,'no-store');
    return Response.json({ok:false,error:'pdf_layout_overflow',message:'El documento no cabe en una sola pagina Letter.'},{status:422});
  });
  await assert.rejects(() => fetchInvoicePdf('/api/invoices/synthetic/pdf'),/one Letter page/);
  assert.equal(fetched.mock.callCount(),1);
});
test('PDF fetch accepts a PDF and rejects an HTML session response', async (t) => {
  const fetched = t.mock.method(globalThis,'fetch',async () => new Response('synthetic-pdf',{headers:{'content-type':'application/pdf'}}));
  assert.equal(await (await fetchInvoicePdf('/synthetic.pdf')).text(),'synthetic-pdf');
  fetched.mock.mockImplementation(async () => new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}}));
  await assert.rejects(() => fetchInvoicePdf('/synthetic.pdf'),/Check your session/);
});

test('seller messages translate validation, API outcomes, and combined failures without changing contracts', () => {
  assert.equal(sellerMessage('Cada tramo debe tener longitud positiva.'),'Each run must have a positive length.');
  assert.equal(sellerMessage('El descuento no puede superar el 100 por ciento. El deposito no puede superar el total.'),
    'The discount cannot exceed 100 percent. The deposit cannot exceed the total.');
  assert.equal(sellerMessage('Documento enviado al cliente con copia al negocio.'),
    'Document emailed to the customer with a copy to the business.');
  assert.equal(sellerMessage('Otro vendedor guardo cambios. Recarga antes de guardar.'),
    'Another seller saved changes. Reload the document before saving.');
  const gateMessage = sellerMessage('Abertura superpuesta o fuera del tramo: Front run');
  assert.equal(gateMessage,'Gate openings overlap or extend beyond run: Front run');
  assert.equal(sellerMessage(gateMessage),gateMessage);
  assert.equal(sellerMessage('Abertura superpuesta o fuera del tramo: Front run Los gates deben tener ancho y altura positivos.'),
    'Gate openings overlap or extend beyond run: Front run Each gate must have a positive width and height.');
});

test('overflow remains actionable in English and unknown server errors do not leak raw content', () => {
  for (const code of ['pdf_layout_overflow','PDF_LAYOUT_OVERFLOW']) {
    const message = sellerMessage('private backend detail',code);
    assert.match(message,/one Letter page/); assert.match(message,/save and edit the draft/);
    assert.equal(sellerMessage(message),message);
  }
  assert.equal(sellerMessage('Unexpected server detail: synthetic-private-data'),
    'Unable to complete the request. Your edits are still in the editor.');
  assert.equal(sellerMessage('Failed to fetch'),'Unable to connect. Check your connection and try again.');
  assert.equal(sellerMessage(undefined),sellerMessage('unknown failure'));
});

test('job summary uses actual footage, openings, camera counts, and priced total', () => {
  const order = newOrder(); order.rateCents = 3000;
  order.cameras.included = 2; order.cameras.extra = 0;
  const primary = input('200');
  editFootage(order,primary,() => {});
  let result = calculate(order);
  assert.deepEqual(jobSummaryValues(order,result),{
    footage:'200 ft',openings:'0 ft',gates:'0 gates',cameras:'2','camera-detail':'2 included / 0 extra',total:money(result.totalCents),
  });
  assert.equal(result.totalCents,600000);
  order.gates = [{id:'gate',kind:'plank',widthFt:12,heightFt:6,runId:order.runs[0].id,offsetFt:20,
    included:true,priceCents:0,separatePosts:false,reinforced:false}];
  order.cameras.extra = 1; order.cameras.unitCents = 5000;
  result = calculate(order);
  const summary = jobSummaryValues(order,result);
  assert.equal(summary.footage,'200 ft'); assert.equal(summary.openings,'12 ft');
  assert.equal(summary.gates,'1 gate'); assert.equal(summary.cameras,'3');
  assert.equal(summary['camera-detail'],'2 included / 1 extra');
  assert.equal(summary.total,money(result.totalCents));
  const name = 'Customer-selected run name';
  order.runs[0].name = name;
  primary.type('200.5'); editFootage(order,primary,() => {});
  assert.equal(order.runs[0].name,name);
});
