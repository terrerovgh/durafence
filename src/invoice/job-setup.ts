import { minDoubleGateFt, type Gate, type Order } from './model.ts';

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
    double: false,
  };
}

export function setGateWidth(order: Order, gate: Gate, widthFt: number): void {
  gate.widthFt = widthFt;
  if (!(widthFt >= minDoubleGateFt)) gate.double = false;
  placeGate(order, gate);
}

export function setGateDouble(gate: Gate, double: boolean): void {
  gate.double = double && gate.widthFt >= minDoubleGateFt;
}

/**
 * Put a gate inside its run (or the only run) so its opening is taken out of the
 * fence rails, planks and screws. A gate that already fits keeps its offset;
 * otherwise it is centered in the largest free stretch so openings never overlap.
 */
export function placeGate(order: Order, gate: Gate): void {
  const run = gate.runId ? order.runs.find((candidate) => candidate.id === gate.runId)
    : order.runs.length === 1 ? order.runs[0] : undefined;
  const width = units(gate.widthFt), length = units(run?.lengthFt ?? 0);
  if (!run || !(width > 0) || width > length) return;
  const taken = order.gates
    .filter((other) => other !== gate && other.runId === run.id && other.widthFt > 0)
    .map((other) => [units(other.offsetFt), units(other.offsetFt) + units(other.widthFt)])
    .sort((a, b) => a[0] - b[0]);
  const fits = (start: number) => start >= 0 && start + width <= length
    && taken.every(([from, to]) => start + width <= from || start >= to);
  if (gate.runId === run.id && fits(units(gate.offsetFt))) return;
  let best: [number, number] | null = null, cursor = 0;
  for (const [from, to] of [...taken, [length, length]]) {
    if (from - cursor >= width && (!best || from - cursor > best[1] - best[0])) best = [cursor, from];
    cursor = Math.max(cursor, to);
  }
  if (!best) return;
  const slack = best[1] - best[0] - width;
  gate.runId = run.id;
  gate.offsetFt = (best[0] + Math.floor(slack / 200) * 100) / 100;
}

export function placeGates(order: Order): void {
  order.gates.forEach((gate) => placeGate(order, gate));
}

const units = (feet: number) => Math.round((Number(feet) || 0) * 100);
