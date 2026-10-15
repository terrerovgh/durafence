import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editFootage, syncFootageInputs } from './dashboard.ts';
import { calculate, newOrder } from './model.ts';
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
