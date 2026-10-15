import type { Gate, Order } from './model.ts';

export const gateWidthChoices = [3, 6, 12] as const;
const maxCount = 12;

export function footageOf(order: Order): number {
  return Math.round(order.runs.reduce((sum, run) => sum + (Number(run.lengthFt) || 0), 0) * 100) / 100;
}

/** One fence line is the normal iPad job. Several runs stay under manual control. */
export function setFootage(order: Order, raw: number): void {
  if (order.runs.length > 1) return;
  const value = Number.isFinite(raw) && raw > 0 ? Math.round(Math.min(raw, 5000) * 100) / 100 : 0;
  if (order.runs.length === 0) {
    if (!(value > 0)) return;
    order.runs.push({ id: crypto.randomUUID(), name: 'Cerca', lengthFt: value, startNode: 'P1', endNode: 'P2' });
    return;
  }
  order.runs[0].lengthFt = value;
  if (!order.runs[0].name) order.runs[0].name = 'Cerca';
}

export function setGateCount(order: Order, count: number): void {
  const next = clampCount(count);
  while (order.gates.length > next) order.gates.pop();
  while (order.gates.length < next) order.gates.push(blankGate(order));
}

export function setIncludedCameras(order: Order, count: number): void {
  order.cameras.included = clampCount(count);
}

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(maxCount, Math.trunc(count)));
}

function blankGate(order: Order): Gate {
  return {
    id: crypto.randomUUID(),
    kind: 'plank',
    widthFt: 0,
    heightFt: order.heightFt > 0 ? order.heightFt : 6,
    runId: '',
    offsetFt: 0,
    included: true,
    priceCents: 0,
    separatePosts: false,
    reinforced: false,
  };
}
