import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, StandardFonts, type PDFPage } from 'pdf-lib';
import { fenceScene, feet, drawingLimits, type BayDrawing } from './fence-scene.ts';
import { appendTechnicalDrawing, renderFenceScene, drawingLines } from './pdf-drawing.ts';
import { estimateBay, estimateSchedule, invoiceBay, invoiceSchedule } from './order-drawing.ts';
import { drawBay } from '../scripts/fence-drawing.ts';
import { priceEstimate, applyDiscount } from '../data/estimate.ts';
import { buildEstimatePdf } from '../data/estimate-pdf.ts';
import { newOrder, calculate, type StoredInvoice } from '../invoice/model.ts';
import { buildInvoicePdf } from '../invoice/pdf.ts';

const base: BayDrawing = { packageName: 'Standard', heightFt: 6, embedFt: 2, postSpacingFt: 4,
  rails: 2, screwsPerPicket: 4, runLabel: '200', hasFence: true };
const label = (spec: BayDrawing, role: string) => fenceScene(spec).primitives.find((item) => item.kind === 'text' && item.role === role);

test('custom heights, embedment and post lengths describe the actual order', () => {
  for (const heightFt of [3, 6, 8, 12, 50]) for (const embedFt of [0, 2, 20]) {
    const spec = { ...base, heightFt, embedFt };
    assert.equal((label(spec, 'height') as { text: string }).text, feet(heightFt));
    assert.equal((label(spec, 'post-length') as { text: string }).text, 'POST LENGTH  ' + feet(heightFt + embedFt));
    assert.match(fenceScene(spec).description, /Not to scale \/ illustrative/);
    if (embedFt === 0) assert.equal(fenceScene(spec).primitives.some((item) => item.role === 'concrete'), false);
    else assert.equal((label(spec, 'embedment') as { text: string }).text, feet(embedFt));
  }
});

test('extreme spacing and rail counts retain numeric truth with finite bounded primitives', () => {
  for (const postSpacingFt of [0.1, 4, 5000]) for (const rails of [1, 2, 3, 100]) {
    const spec = { ...base, postSpacingFt, rails };
    const scene = fenceScene(spec);
    assert.equal((label(spec, 'spacing') as { text: string }).text, feet(postSpacingFt) + ' O.C.');
    assert.equal((label(spec, 'rail-count') as { text: string }).text, 'RAILS / BAY  ' + rails);
    assert.ok(scene.primitives.length < 250);
    for (const [role, max] of Object.entries(drawingLimits)) {
      const singular = role === 'pickets' ? 'picket' : role === 'rails' ? 'rail' : 'screw';
      assert.ok(scene.primitives.filter((item) => item.role === singular).length <= max);
    }
    for (const item of scene.primitives) {
      const points = item.kind === 'line' ? [{ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }]
        : item.kind === 'polygon' ? item.points : [{ x: item.x, y: item.y },
          { x: item.x + (item.kind === 'rect' ? item.width : 0), y: item.y + (item.kind === 'rect' ? item.height : 0) }];
      for (const point of points) {
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        assert.ok(point.x >= 0 && point.x <= scene.width && point.y >= 0 && point.y <= scene.height);
      }
      if (item.kind === 'text') assert.ok(item.size >= 9);
    }
  }
  assert.throws(() => fenceScene({ ...base, heightFt: NaN }), RangeError);
  assert.throws(() => fenceScene({ ...base, rails: 2.5 }), RangeError);
});

test('no fence and all-opening orders contain no invented fence or gate elevation', () => {
  const scene = fenceScene({ ...base, hasFence: false });
  assert.match(scene.description, /No fence elevation/);
  assert.equal(scene.primitives.some((item) => ['post', 'rail', 'picket', 'concrete'].includes(item.role)), false);
  const order = newOrder();
  order.runs = [{ id: 'one', name: 'front', lengthFt: 12, startNode: 'a', endNode: 'b' }];
  order.gates = [{ id: 'gate', kind: 'plank', widthFt: 12, heightFt: 8, runId: 'one', offsetFt: 0,
    included: true, priceCents: 0, separatePosts: false, reinforced: false }];
  assert.equal(invoiceBay(order, calculate(order)).hasFence, false);
});

test('schedules state supplied gate dimensions without inventing site geometry', () => {
  const order = newOrder();
  order.runs = [{ id: 'one', name: 'Front', lengthFt: 200, startNode: 'a', endNode: 'b' },
    { id: 'two', name: 'Side', lengthFt: 75, startNode: 'b', endNode: 'c' }];
  order.gates = [
    { id: 'g1', kind: 'plank', widthFt: 12, heightFt: 8, runId: 'one', offsetFt: 20, included: true, priceCents: 0, separatePosts: false, reinforced: false },
    { id: 'g2', kind: 'aluminum', widthFt: 3, heightFt: 6, runId: '', offsetFt: 0, included: false, priceCents: 100, separatePosts: false, reinforced: false },
  ];
  const schedule = invoiceSchedule(order, calculate(order)).join('\n');
  assert.match(schedule, /Run 1 \(Front\): 200 ft/);
  assert.match(schedule, /Run 2 \(Side\): 75 ft/);
  assert.match(schedule, /Plank, 12 ft wide x 8 ft high; assigned to run 1/);
  assert.match(schedule, /Custom aluminum, 3 ft wide x 6 ft high; standalone/);
  assert.match(schedule, /no site plan|do not specify a site plan/);
  order.gates = [];
  order.cameras.extra = 2;
  assert.ok(invoiceSchedule(order, calculate(order)).includes('No gates specified.'));
  order.runs = [];
  assert.ok(invoiceSchedule(order, calculate(order)).includes('No fence runs specified.'));
});

test('SVG fit modes use the same scene and requested custom dimensions as PDF', () => {
  class Element {
    attributes: Record<string, string> = {};
    children: Element[] = [];
    textContent = '';
    id = '';
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    append(...nodes: Element[]) { this.children.push(...nodes); }
    replaceChildren() { this.children = []; }
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElementNS: () => new Element() } });
  try {
    const spec = { ...base, heightFt: 12, embedFt: 3, rails: 100, postSpacingFt: 5000 };
    for (const fit of ['sheet', 'invoice'] as const) {
      const root = new Element();
      drawBay(root as unknown as SVGSVGElement, spec, fit);
      assert.equal(root.attributes.viewBox, '0 0 532 470');
      assert.equal(root.children[0].textContent, fenceScene(spec).description);
      assert.equal(root.children.length, fenceScene(spec).primitives.length + 1);
      assert.ok(root.children.some((node) => node.textContent === 'POST LENGTH  15 ft'));
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('Letter drawing labels fit their measured boxes at 9 pt or larger inside 40 pt margins', async () => {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = {
    drawText(value: string, options: { x: number; y: number; size: number; font: typeof regular }) {
      assert.ok(options.size >= 9);
      assert.ok(options.x >= 40 && options.x + options.font.widthOfTextAtSize(value, options.size) <= 572);
      assert.ok(options.y >= 40 && options.y + options.size <= 752);
    },
    drawRectangle() {}, drawLine() {}, drawSvgPath() {},
  } as unknown as PDFPage;
  for (const heightFt of [3, 6, 8, 12, 50]) for (const postSpacingFt of [0.1, 5000]) {
    renderFenceScene(page, regular, bold, fenceScene({ ...base, heightFt, embedFt: 20, postSpacingFt, rails: 100 }));
  }
  renderFenceScene(page, regular, bold, fenceScene({ ...base, hasFence: false }));
  appendTechnicalDrawing(doc, regular, bold, base, Array.from({ length: 100 }, (_, i) => 'Run ' + i + ': ' + 'Long reference '.repeat(30)));
  assert.ok(doc.getPageCount() > 2);
  for (const line of drawingLines('A'.repeat(500) + ' \u4e2d\u6587', regular, 9, 532)) {
    assert.ok(regular.widthOfTextAtSize(line, 9) <= 532);
  }
  assert.doesNotThrow(() => renderFenceScene(doc.addPage([612, 792]), regular, bold, fenceScene(base)));
});

test('estimate and invoice PDFs generate custom-height appendices and safe non-Latin references', async () => {
  const result = priceEstimate({ lengthFt: 200, packageId: 'standard', labor: 'installed',
    extraGates: { ft12: 0, ft6: 0, ft3: 0 }, extraScrewLb: 0, aluminumGates: [] });
  assert.match(estimateSchedule(result).join('\n'), /gate heights and locations are not supplied/);
  for (const heightFt of [3, 6, 8, 12]) {
    assert.equal(estimateBay(result, heightFt).heightFt, heightFt);
    const bytes = await buildEstimatePdf({ customer: { name: '\u4e2d\u6587', address: 'Synthetic', email: 'test@example.test', phone: '' },
      result, heightFt, payByCard: false, discount: applyDiscount(result.totalCents, ''), sentOn: 'October 14, 2026' });
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 2);
    for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  }
  const order = newOrder();
  order.customer.name = '\u4e2d\u6587';
  order.cameras.extra = 2;
  order.items = [{ id: 'one', description: 'Accessory only', quantity: 1, unit: 'unit', unitCents: 100, included: false }];
  const invoice: StoredInvoice = { id: 'synthetic', seq: 1, version: 1, number: 'DFM-TEST', kind: 'estimate',
    createdAt: '2026-10-14T12:00:00Z', updatedAt: '2026-10-14T12:00:00Z', actor: 'test@example.test', order, payments: [] };
  assert.ok((await PDFDocument.load(await buildInvoicePdf(invoice))).getPageCount() >= 2);
});
