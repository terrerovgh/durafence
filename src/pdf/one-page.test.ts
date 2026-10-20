import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { measureOnePage, renderOnePage, packingProfiles, safePdfText, wrapPdfText, type PagePlan } from './one-page.ts';
import { PdfLayoutOverflowError, PDF_OVERFLOW_EN } from './layout-error.ts';
import { compactFenceScene } from '../drawing/compact-scene.ts';
import { priceEstimate, applyDiscount } from '../data/estimate.ts';
import { buildEstimatePdf, estimatePdfInput } from '../data/estimate-pdf.ts';
import { buildInvoicePdf, invoicePdfInput } from '../invoice/pdf.ts';
import { newOrder, type StoredInvoice } from '../invoice/model.ts';

async function fonts() {
  const doc = await PDFDocument.create();
  return { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}
function invoice(): StoredInvoice {
  const order = newOrder(); order.rateCents = 3000;
  order.customer = { name:'Synthetic Customer',email:'customer@example.test',phone:'5550100',address:'100 Synthetic Street, Valdosta, GA 31601' };
  order.runs = [{ id:'front',name:'Front',lengthFt:200,startNode:'A',endNode:'B' }];
  return { id:'synthetic',seq:1,version:3,number:'DFM-2026-000123',kind:'invoice',order,payments:[],
    actor:'PRIVATE_ACTOR_MUST_NOT_APPEAR',createdAt:'2026-10-14T12:00:00Z',updatedAt:'2026-10-14T12:00:00Z' };
}
function letter(heightFt = 6, lengthFt = 200) {
  const result = priceEstimate({ lengthFt,packageId:'premium',labor:'installed',extraGates:{ft12:0,ft6:0,ft3:0},extraScrewLb:lengthFt ? 0 : 2,aluminumGates:[] });
  return { result,heightFt,customer:{ name:'Jos\u00e9 & Sons <Test>',email:'customer@example.test',phone:'5550100',address:'100 Synthetic Street, Valdosta, GA 31601' },
    payByCard:true,discount:applyDiscount(result.totalCents,'DURA10'),sentOn:'October 14, 2026' };
}
const compactText = (plan: PagePlan) => plan.texts.map((line) => line.text).join('').replace(/\s/g,'');
const contains = (plan: PagePlan, value: string) => assert.ok(compactText(plan).includes(safePdfText(value).replace(/\s/g,'')), value);
function audit(plan: PagePlan) {
  assert.ok(packingProfiles.some((profile) => profile.name === plan.profile));
  for (const line of plan.texts) {
    assert.ok(line.size >= 7.5);
    assert.ok(line.x >= 40 && line.x + line.width <= 572.001);
    assert.ok(line.y >= 40 && line.y + line.height <= 752);
  }
  for (let i = 0; i < plan.texts.length; i += 1) for (const b of plan.texts.slice(i + 1)) {
    const a = plan.texts[i];
    if (!a.width || !b.width) continue;
    const overlaps = a.x < b.x + b.width - 0.01 && a.x + a.width > b.x + 0.01 &&
      a.y < b.y + b.height - 0.01 && a.y + a.height > b.y + 0.01;
    assert.equal(overlaps,false,'Text boxes overlap: ' + a.text + ' / ' + b.text);
  }
  for (const item of plan.graphics) {
    const points = item.kind === 'line' ? [{x:item.x1,y:item.y1},{x:item.x2,y:item.y2}]
      : item.kind === 'rect' ? [{x:item.x,y:item.y},{x:item.x+item.width,y:item.y+item.height}] : item.points;
    for (const point of points) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 40 && point.x <= 572 && point.y >= 40 && point.y <= 752);
  }
}

test('public estimates and private kinds use one measured Letter design with visible drawings', async () => {
  const metrics = await fonts();
  for (const height of [3,6,8,12]) {
    const publicLetter = letter(height), input = estimatePdfInput(publicLetter);
    const plan = measureOnePage(input,metrics);
    audit(plan); contains(plan,'ESTIMATE'); contains(plan,'NOT TO SCALE / ILLUSTRATIVE');
    contains(plan,height + ' ft'); contains(plan,(height + 2) + ' ft');
    contains(plan,publicLetter.customer.name);
    assert.equal((await PDFDocument.load(await buildEstimatePdf(publicLetter))).getPageCount(),1);
    for (const kind of ['estimate','invoice'] as const) {
      const document = invoice(); document.kind = kind; document.order.heightFt = height;
      document.order.embedFt = 3; document.order.cameras.included = 2; document.order.gates = [];
      const privatePlan = measureOnePage(invoicePdfInput(document),metrics);
      audit(privatePlan); contains(privatePlan,kind.toUpperCase()); contains(privatePlan,document.number);
      contains(privatePlan,'Cameras: 2 included + 0 extra.'); contains(privatePlan,'No gates specified.');
      contains(privatePlan,'Post length: ' + (height + 3) + ' ft');
      const pdf = await PDFDocument.load(await buildInvoicePdf(document));
      assert.equal(pdf.getPageCount(),1); assert.deepEqual(pdf.getPage(0).getSize(),{width:612,height:792});
    }
  }
});

test('complete multi-run gates, price terms, payments and reversals fit without truncation', async () => {
  const document = invoice(), order = document.order;
  order.customer.name = 'Synthetic Family and Business With A Longer Normal Name';
  order.customer.address = '100 Synthetic Street, Building B, Valdosta, Georgia 31601';
  order.customer.email = 'longer.synthetic.customer@example.test';
  order.runs.push({id:'side',name:'Side return',lengthFt:75,startNode:'B',endNode:'C'});
  order.gates = [
    {id:'gate1',kind:'plank',widthFt:12,heightFt:8,runId:'front',offsetFt:20,included:true,priceCents:0,separatePosts:false,reinforced:true,double:true},
    {id:'gate2',kind:'aluminum',widthFt:3,heightFt:6,runId:'',offsetFt:0,included:false,priceCents:45000,separatePosts:true,reinforced:false,double:false},
  ];
  order.cameras.included = 2;
  order.discount = {kind:'percent',value:10}; order.charge = {label:'Site preparation',percent:7};
  order.deposit = {kind:'percent',value:30};
  order.terms = 'Confirm the agreed dimensions and installation date with the customer before fabrication.';
  order.internalNotes = 'PRIVATE_INTERNAL_MUST_NOT_APPEAR';
  document.payments = [
    {id:'paid',date:'2026-10-14',method:'cash',amountCents:100000,note:'Deposit received in person.'},
    {id:'reversed',date:'2026-10-15',method:'reversal',amountCents:-100000,note:'Customer changed payment method.',reverses:'paid'},
  ];
  const plan = measureOnePage(invoicePdfInput(document),await fonts());
  audit(plan);
  for (const value of [order.customer.name,order.customer.address,order.customer.email,'Run 2 (Side return): 75 ft.',
    'Gate 1: Plank, 12 ft wide x 8 ft high, double (2 x 6 ft leaves); run 1 at 20 ft; shared posts, reinforced.',
    'Gate 2: Custom aluminum, 3 ft wide x 6 ft high, single leaf; standalone; separate posts.',
    'Site preparation','Agreed deposit','Payments received','Balance',order.terms,
    'Reversal of payment 1. Customer changed payment method.']) contains(plan,value);
  assert.doesNotMatch(plan.texts.map((line) => line.text).join(' '),/PRIVATE_/);
  assert.equal((await PDFDocument.load(await buildInvoicePdf(document))).getPageCount(),1);
});

test('accessories, standalone gates and extreme valid drawing specs remain honest and bounded', async () => {
  const metrics = await fonts();
  const document = invoice();
  document.order.runs = []; document.order.cameras.included = 2;
  document.order.items = [{id:'service',description:'Camera setup',quantity:1,unit:'service',unitCents:5000,included:false}];
  let plan = measureOnePage(invoicePdfInput(document),metrics);
  audit(plan); contains(plan,'Gate / accessory order. No fence elevation.');
  document.order.gates = [{id:'gate',kind:'aluminum',widthFt:12,heightFt:8,runId:'',offsetFt:0,included:false,priceCents:80000,separatePosts:true,reinforced:true}];
  plan = measureOnePage(invoicePdfInput(document),metrics); audit(plan); contains(plan,'12 ft wide x 8 ft high');
  assert.equal((await PDFDocument.load(await buildInvoicePdf(document))).getPageCount(),1);
  assert.equal((await PDFDocument.load(await buildEstimatePdf(letter(8,0)))).getPageCount(),1);
  for (const postSpacingFt of [0.1,5000]) for (const rails of [1,3,100]) {
    const spec = {...invoicePdfInput(invoice()).spec,postSpacingFt,rails,heightFt:12,embedFt:0};
    const scene = compactFenceScene(spec);
    assert.ok(scene.primitives.length < 250);
    const input = invoicePdfInput(invoice()); input.spec = spec;
    const measured = measureOnePage(input,metrics); audit(measured);
    contains(measured,postSpacingFt + ' ft O.C.'); contains(measured,'Rails / bay: ' + rails);
  }
});

test('safe replacement, long words and escaped customer names retain the full printable content', async () => {
  const input = invoicePdfInput(invoice()), metrics = await fonts();
  input.customer.name = 'Jos\u00e9 & Sons <Synthetic> \u4e2d\u6587';
  const plan = measureOnePage(input,metrics); audit(plan); contains(plan,input.customer.name);
  for (const raw of ['W'.repeat(200),'i ' + 'W'.repeat(200),'Line one\nLine two']) {
    const lines = wrapPdfText(raw,metrics.regular,8.5,248);
    assert.equal(lines.join('').replace(/\s/g,''),safePdfText(raw).replace(/\s/g,''));
    for (const line of lines) assert.ok(metrics.regular.widthOfTextAtSize(line,8.5) <= 248);
  }
});

test('40 items, 4000 term characters and 1000 payments fail before addPage or save', async (t) => {
  const original = PDFDocument.prototype.addPage, save = PDFDocument.prototype.save;
  const added = t.mock.method(PDFDocument.prototype,'addPage',function(this: PDFDocument,...args: Parameters<typeof original>) { return original.apply(this,args); });
  const saved = t.mock.method(PDFDocument.prototype,'save',function(this: PDFDocument,...args: Parameters<typeof save>) { return save.apply(this,args); });
  for (const variant of ['items','terms','payments']) {
    const document = invoice();
    if (variant === 'items') document.order.items = Array.from({length:40},(_,i) => ({id:String(i),description:'Negotiated service ' + i,quantity:1,unit:'service',unitCents:100,included:false}));
    if (variant === 'terms') document.order.terms = 'T'.repeat(4000);
    if (variant === 'payments') document.payments = Array.from({length:1000},(_,i) => ({id:String(i),date:'2026-10-14',method:'cash',amountCents:100,note:'Synthetic payment ' + i}));
    const snapshot = JSON.stringify(document);
    await assert.rejects(() => buildInvoicePdf(document),(error: unknown) => error instanceof PdfLayoutOverflowError && error.code === 'PDF_LAYOUT_OVERFLOW' && error.message === PDF_OVERFLOW_EN);
    assert.equal(JSON.stringify(document),snapshot);
  }
  assert.equal(added.mock.callCount(),0); assert.equal(saved.mock.callCount(),0);
  const normal = invoicePdfInput(invoice());
  const bytes = await renderOnePage(normal);
  assert.ok(bytes.length > 1000);
  assert.equal(added.mock.callCount(),1); assert.equal(saved.mock.callCount(),1);
});
