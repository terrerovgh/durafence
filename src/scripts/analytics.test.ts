import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEstimateTracker } from './analytics.ts';

test('an invalid first edit starts the estimate without completing it', () => {
  const events: string[] = [];
  const observe = createEstimateTracker((name) => events.push(name));
  observe(false);
  observe(false);
  assert.deepEqual(events, ['estimate_start']);
});

test('completion is recorded once after a valid calculation, including later edits', () => {
  const events: string[] = [];
  const observe = createEstimateTracker((name) => events.push(name));
  observe(false);
  observe(true);
  observe(true);
  observe(false);
  observe(true);
  assert.deepEqual(events, ['estimate_start', 'estimate_complete']);
});

test('a valid first edit records start before completion and visits are independent', () => {
  const events: string[] = [];
  createEstimateTracker((name) => events.push(name))(true);
  createEstimateTracker((name) => events.push(name))(true);
  assert.deepEqual(events, ['estimate_start', 'estimate_complete', 'estimate_start', 'estimate_complete']);
});
