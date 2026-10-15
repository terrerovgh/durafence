import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newOrder } from './model.ts';
import { footageOf, setFootage, setGateCount, setIncludedCameras } from './job-setup.ts';

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
