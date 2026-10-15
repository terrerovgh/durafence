import type { Estimate } from '../data/estimate.ts';
import type { Order, Calculation } from '../invoice/model.ts';
import { feet, type BayDrawing } from './fence-scene.ts';

export function estimateBay(result: Estimate, heightFt: number): BayDrawing {
  return { packageName: result.packageName, postSpacingFt: result.postSpacingFt,
    rails: result.railCount, screwsPerPicket: result.screwsPerPicket, heightFt,
    embedFt: 2, runLabel: result.runLabel, hasFence: result.hasFence };
}

export function estimateSchedule(result: Estimate): string[] {
  const gates = result.materials.filter((item) => /gate/i.test(item.label));
  return [
    'Package: ' + result.packageName + '. Run: ' + (result.runLabel ? result.runLabel + ' ft' : 'none') + '.',
    'Typical detail only. Public estimate uses 2 ft post embedment; confirm before fabrication.',
    'GATE DIMENSION SCHEDULE - widths only; gate heights and locations are not supplied.',
    ...(gates.length ? gates.map((gate) => gate.label + ': ' + gate.value + (gate.detail ? ' / ' + gate.detail : ''))
      : ['No gates specified.']),
  ];
}

export function invoiceBay(order: Order, result: Calculation): BayDrawing {
  return { packageName: order.packageId, postSpacingFt: result.spacingFt, rails: result.railCount,
    screwsPerPicket: result.screwsPerPlank, heightFt: order.heightFt, embedFt: order.embedFt,
    runLabel: String(result.grossFt), hasFence: result.netFt > 0 };
}

export function invoiceSchedule(order: Order, result: Calculation): string[] {
  return [
    'Package: ' + order.packageId + '. Contracted: ' + feet(result.grossFt) + '; openings: ' + feet(result.openingFt) + '; solid fence: ' + feet(result.netFt) + '.',
    'One representative bay only. Run lengths do not specify a site plan, angles or gate swings.',
    ...(order.runs.length ? order.runs.map((run, i) => 'Run ' + (i + 1) + ' (' + run.name + '): ' + feet(run.lengthFt) + '.')
      : ['No fence runs specified.']),
    'GATE DIMENSION SCHEDULE - width x height, as supplied',
    ...(order.gates.length ? order.gates.map((gate, i) => 'Gate ' + (i + 1) + ': ' +
      (gate.kind === 'plank' ? 'Plank' : 'Custom aluminum') + ', ' + feet(gate.widthFt) + ' wide x ' + feet(gate.heightFt) + ' high; ' +
      (gate.runId ? 'assigned to run ' + (order.runs.findIndex((run) => run.id === gate.runId) + 1) : 'standalone') + '.')
      : ['No gates specified.']),
  ];
}
