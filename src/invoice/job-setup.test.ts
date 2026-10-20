import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculate, newOrder } from './model.ts';
import { footageOf, placeGates, setFootage, setGateCount, setGateDouble, setGateWidth, setIncludedCameras } from './job-setup.ts';

test('a new estimate has footage to fill and no gate', () => {
  const order = newOrder();
  assert.equal(footageOf(order), 0);
  assert.equal(order.gates.length, 0);
  setFootage(order, 200);
  assert.equal(order.runs.length, 1);
  assert.equal(order.runs[0].lengthFt, 200);
  assert.equal(order.gates.length, 0);
});

test('clearing the only run length does not invent a gate', () => {
  const order = newOrder();
  setFootage(order, 80);
  setFootage(order, 0);
  assert.equal(order.runs[0].lengthFt, 0);
  assert.equal(order.gates.length, 0);
});

test('gate count can be zero, then two, without a default width', () => {
  const order = newOrder();
  setFootage(order, 150);
  setGateCount(order, 0);
  assert.equal(order.gates.length, 0);
  setGateCount(order, 2);
  assert.equal(order.gates.length, 2);
  assert.equal(order.gates[0].widthFt, 0);
  assert.equal(order.gates[1].widthFt, 0);
  setGateCount(order, 0);
  assert.equal(order.gates.length, 0);
  assert.equal(footageOf(order), 150);
});

test('zero gates and two included cameras is a valid job setup', () => {
  const order = newOrder();
  setFootage(order, 200);
  setGateCount(order, 0);
  setIncludedCameras(order, 2);
  assert.equal(order.gates.length, 0);
  assert.equal(order.cameras.included, 2);
  assert.equal(order.cameras.extra, 0);
});

test('several runs are not overwritten by the primary footage control', () => {
  const order = newOrder();
  order.runs = [
    { id: 'a', name: 'Frente', lengthFt: 40, startNode: 'P1', endNode: 'P2' },
    { id: 'b', name: 'Lateral', lengthFt: 20, startNode: 'P2', endNode: 'P3' },
  ];
  setFootage(order, 999);
  assert.equal(footageOf(order), 60);
  assert.equal(order.runs[1].lengthFt, 20);
});

test('choosing widths for two gates places both openings in the run without overlap', () => {
  const order = newOrder();
  setFootage(order, 200);
  setGateCount(order, 2);
  setGateWidth(order, order.gates[0], 12);
  setGateWidth(order, order.gates[1], 12);
  assert.deepEqual(order.gates.map((gate) => gate.runId), [order.runs[0].id, order.runs[0].id]);
  assert.deepEqual(order.gates.map((gate) => gate.offsetFt), [94, 41]);
  const result = calculate(order);
  assert.deepEqual(result.issues, []);
  assert.equal(result.openingFt, 24);
  assert.equal(result.netFt, 176);
  assert.equal(result.materials.railFeet, 176 * result.railCount);
});

test('gates chosen before the footage are placed once the footage is entered', () => {
  const order = newOrder();
  setGateCount(order, 3);
  order.gates.forEach((gate) => setGateWidth(order, gate, 6));
  assert.ok(order.gates.every((gate) => gate.runId === ''));
  setFootage(order, 120);
  placeGates(order);
  const result = calculate(order);
  assert.deepEqual(result.issues, []);
  assert.equal(result.openingFt, 18);
  assert.equal(result.netFt, 102);
});

test('an overlapping saved gate moves to free fence; a valid offset is kept', () => {
  const order = newOrder();
  setFootage(order, 100);
  setGateCount(order, 2);
  order.gates.forEach((gate) => { gate.widthFt = 12; gate.runId = order.runs[0].id; gate.offsetFt = 0; });
  placeGates(order);
  assert.deepEqual(calculate(order).issues, []);
  const kept = order.gates.map((gate) => gate.offsetFt);
  placeGates(order);
  assert.deepEqual(order.gates.map((gate) => gate.offsetFt), kept);
});

test('a gate wider than the free fence stays out of the run instead of overlapping', () => {
  const order = newOrder();
  setFootage(order, 20);
  setGateCount(order, 2);
  setGateWidth(order, order.gates[0], 12);
  setGateWidth(order, order.gates[1], 12);
  assert.equal(order.gates[0].runId, order.runs[0].id);
  assert.equal(order.gates[1].runId, '');
});

test('a 12 ft gate can be single or two 6 ft leaves; narrow gates stay single', () => {
  const order = newOrder();
  setFootage(order, 100);
  setGateCount(order, 1);
  const [gate] = order.gates;
  setGateWidth(order, gate, 12);
  assert.equal(gate.double, false);
  setGateDouble(gate, true);
  assert.equal(gate.double, true);
  setGateWidth(order, gate, 3);
  assert.equal(gate.double, false);
  setGateDouble(gate, true);
  assert.equal(gate.double, false);
});
