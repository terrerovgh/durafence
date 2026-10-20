import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newOrder, normalizeOrder, calculate, issuanceIssues, type Order, type Gate } from './model.ts';
function sample(): Order {
  const order = newOrder(); order.rateCents = 3000;
  order.runs = [{ id: 'front', name: 'Front', lengthFt: 200, startNode: 'A', endNode: 'B' }];
  return order;
}
function gate(overrides: Partial<Gate> = {}): Gate {
  return { id:'gate', kind:'plank', widthFt:12, heightFt:6, runId:'front', offsetFt:100, included:true,
    priceCents:100000, separatePosts:false, reinforced:false, double:false, ...overrides };
}
test('200 ft Standard at negotiated 30 USD has no mandatory gate and accepts two included cameras', () => {
  const order=sample(); order.cameras.included=2;
  const result=calculate(order);
  assert.equal(result.totalCents,600000);
  assert.equal(result.materials.posts,35);
  assert.equal(result.materials.railFeet,400);
  assert.equal(result.materials.fencePlanks,400);
  assert.equal(result.lines.find((line) => line.description==='Ringbell camera')?.quantity,2);
});
test('included plank opening removes fence materials and adds gate infill without reducing billed footage', () => {
  const order=sample(); order.gates=[gate()];
  const result=calculate(order);
  assert.deepEqual(result.issues,[]);
  assert.equal(result.grossFt,200); assert.equal(result.openingFt,12); assert.equal(result.netFt,188);
  assert.equal(result.materials.posts,34); assert.equal(result.materials.railFeet,376);
  assert.equal(result.materials.fencePlanks,376); assert.equal(result.materials.gatePlanks,24);
  assert.equal(result.materials.screws,800); assert.equal(result.totalCents,600000);
});
test('custom aluminium does not add gate planks or posts inside its opening', () => {
  const order=sample(); order.gates=[gate({kind:'aluminum',included:false,priceCents:360000})];
  const result=calculate(order);
  assert.equal(result.materials.gatePlanks,0); assert.equal(result.materials.screws,752);
  assert.equal(result.materials.posts,34); assert.equal(result.totalCents,960000);
});
test('shared corner nodes are counted once and separate gate posts can be reinforced', () => {
  const order=sample();
  order.runs=[{id:'one',name:'one',lengthFt:12,startNode:'A',endNode:'B'},{id:'two',name:'two',lengthFt:12,startNode:'B',endNode:'C'}];
  assert.equal(calculate(order).materials.posts,5);
  order.runs=sample().runs; order.gates=[gate({separatePosts:true,reinforced:true})];
  assert.equal(calculate(order).materials.posts,36); assert.equal(calculate(order).materials.reinforcedPosts,2);
});
test('overlapping, oversized and orphaned openings prevent issuance', () => {
  const order=sample(); order.gates=[gate(),gate({id:'other',offsetFt:105})];
  assert.ok(calculate(order).issues.length);
  order.gates=[gate({offsetFt:195})]; assert.ok(calculate(order).issues.length);
  order.gates=[gate({runId:'missing'})]; assert.ok(calculate(order).issues.length);
});
test('multiple openings and standalone gates have separate material effects', () => {
  const order=sample(); order.gates=[gate(),gate({id:'second',widthFt:6,offsetFt:150}),gate({id:'standalone',widthFt:3,runId:''})];
  const result=calculate(order); assert.equal(result.netFt,182); assert.equal(result.materials.railFeet,364);
  assert.equal(result.materials.gatePlanks,42); assert.deepEqual(result.issues,[]);
});
test('manual quantities persist across geometry changes and resetting restores automatic values', () => {
  const order=sample(); order.overrides.posts=40; order.runs[0].lengthFt=240;
  assert.equal(calculate(order).materials.posts,40);
  delete order.overrides.posts; assert.equal(calculate(order).materials.posts,41);
});
test('corrected planks recalculate screws unless screws are explicitly corrected', () => {
  const order=sample(); order.overrides.fencePlanks=500;
  assert.equal(calculate(order).materials.screws,1000);
  order.overrides.screws=1200; order.runs[0].lengthFt=240;
  assert.equal(calculate(order).materials.screws,1200);
});
test('discount, named charge, fixed deposit and payments use cents consistently', () => {
  const order=sample(); order.discount={kind:'percent',value:10};
  order.charge={label:'Agreed charge',percent:5}; order.deposit={kind:'amount',value:100000};
  const result=calculate(order,[{id:'p',amountCents:200000,date:'2026-10-14',method:'cash',note:''}]);
  assert.equal(result.discountCents,60000); assert.equal(result.chargeCents,27000);
  assert.equal(result.totalCents,567000); assert.equal(result.depositCents,100000);
  assert.equal(result.balanceCents,367000);
});
test('additional camera requires an explicit price while custom height remains negotiated', () => {
  const order=sample(); order.heightFt=8; order.cameras.extra=1;
  assert.ok(calculate(order).issues.length);
  order.cameras.unitCents=7500;
  assert.equal(calculate(order).totalCents,607500); assert.deepEqual(calculate(order).issues,[]);
});
test('normalization refuses non-finite values, fractional counts, unsupported enums and excessive input', () => {
  const order=sample(); assert.deepEqual(normalizeOrder(order),order);
  assert.throws(() => normalizeOrder({...order,heightFt:Infinity}));
  assert.throws(() => normalizeOrder({...order,cameras:{...order.cameras,included:1.5}}));
  assert.throws(() => normalizeOrder({...order,packageId:'unknown'}));
  assert.throws(() => normalizeOrder({...order,runs:Array(101).fill(order.runs[0])}));
  assert.ok(issuanceIssues(order).length);
});

test('two 12 ft gates in one run each take their opening out of rails, planks and screws', () => {
  const order=sample(); order.gates=[gate({offsetFt:40}),gate({id:'second',offsetFt:140})];
  const result=calculate(order);
  assert.deepEqual(result.issues,[]);
  assert.equal(result.openingFt,24); assert.equal(result.netFt,176);
  assert.equal(result.materials.railFeet,352); assert.equal(result.materials.fencePlanks,352);
  assert.equal(result.materials.gatePlanks,48); assert.equal(result.materials.screws,(352+48)*2);
  // Each gate opening has its own hinge and latch posts at both ends.
  assert.equal(result.materials.posts,33);
});
test('a double gate keeps the opening, posts, planks and price of a single gate of the same width', () => {
  const order=sample(); order.gates=[gate()];
  const single=calculate(order);
  order.gates=[gate({double:true})];
  const double=calculate(order);
  assert.deepEqual(double.materials,single.materials); assert.equal(double.totalCents,single.totalCents);
  assert.equal(double.lines.find((line) => line.unit==='gate')?.description,'Plank gate 12 ft, double (2 x 6 ft leaves)');
});
test('documents saved before double gates load as single gates', () => {
  const order=sample(); order.gates=[gate()];
  const legacy=structuredClone(order) as unknown as { gates: Record<string, unknown>[] };
  delete legacy.gates[0].double;
  assert.equal(normalizeOrder(legacy).gates[0].double,false);
  assert.equal(normalizeOrder({...order,gates:[gate({double:true})]}).gates[0].double,true);
  assert.throws(() => normalizeOrder({...order,gates:[{...gate(),double:'yes'}]}));
});
