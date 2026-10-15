import { fencePackages, aluminumRate, extraGateCatalog, type PackageId, type Labor } from '../data/estimate.ts';

export type Run = { id: string; name: string; lengthFt: number; startNode: string; endNode: string };
export type Gate = {
  id: string; kind: 'plank' | 'aluminum'; widthFt: number; heightFt: number;
  runId: string; offsetFt: number; included: boolean; priceCents: number;
  separatePosts: boolean; reinforced: boolean;
};
export type Item = { id: string; description: string; quantity: number; unit: string; unitCents: number; included: boolean };
export type Payment = { id: string; amountCents: number; date: string; method: string; note: string; reverses?: string };
export type MaterialKey = 'posts' | 'reinforcedPosts' | 'railFeet' | 'fencePlanks' | 'gatePlanks' | 'screws';
export type Order = {
  schemaVersion: 1;
  customer: { name: string; email: string; phone: string; address: string };
  packageId: PackageId; labor: Labor; heightFt: number; embedFt: number; rateCents: number | null;
  spacingFt: number | null; railCount: number | null; screwsPerPlank: number | null;
  runs: Run[]; gates: Gate[]; items: Item[];
  cameras: { included: number; extra: number; unitCents: number | null };
  overrides: Partial<Record<MaterialKey, number>>;
  discount: { kind: 'amount' | 'percent'; value: number };
  charge: { label: string; percent: number };
  deposit: { kind: 'amount' | 'percent'; value: number };
  terms: string; internalNotes: string;
};
export type Calculation = {
  issues: string[]; grossFt: number; openingFt: number; netFt: number; rateCents: number;
  spacingFt: number; railCount: number; screwsPerPlank: number;
  automatic: Record<MaterialKey, number>; materials: Record<MaterialKey, number>;
  lines: { description: string; quantity: number; unit: string; unitCents: number; amountCents: number; included: boolean }[];
  subtotalCents: number; discountCents: number; chargeCents: number; totalCents: number;
  depositCents: number; paidCents: number; balanceCents: number;
};
export type StoredInvoice = {
  id: string; seq: number; version: number; kind: 'estimate' | 'invoice';
  number: string; createdAt: string; updatedAt: string; actor: string;
  order: Order; payments: Payment[];
};

export function newOrder(): Order {
  return {
    schemaVersion: 1, customer: { name: '', email: '', phone: '', address: '' },
    packageId: 'standard', labor: 'installed', heightFt: 6, embedFt: 2, rateCents: null,
    spacingFt: null, railCount: null, screwsPerPlank: null, runs: [], gates: [], items: [],
    cameras: { included: 1, extra: 0, unitCents: null }, overrides: {},
    discount: { kind: 'amount', value: 0 }, charge: { label: '', percent: 0 },
    deposit: { kind: 'percent', value: 25 }, terms: 'Confirm dimensions and site conditions before fabrication or installation.',
    internalNotes: '',
  };
}

export function gateDefault(widthFt: number, kind: Gate['kind'], labor: Labor): number | null {
  if (kind === 'aluminum') return Math.round(widthFt * aluminumRate[labor] * 100);
  const preset = extraGateCatalog.find((gate) => gate.widthFt === widthFt);
  return preset ? preset.price * 100 : null;
}

export function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function normalizeOrder(input: unknown): Order {
  const source = record(input);
  if (source.schemaVersion !== 1) throw new Error('Version de documento no admitida.');
  const readText = (value: unknown, max = 500): string => {
    if (typeof value !== 'string' || value.length > max) throw new Error('Texto no valido o demasiado largo.');
    return value.replace(/\r/g, '').trim();
  };
  const num = (value: unknown, max = 5000, integer = false): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) {
      throw new Error('Cantidad o importe no valido.');
    }
    return value;
  };
  const optional = (value: unknown, max: number, integer = false): number | null => value === null ? null : num(value, max, integer);
  const choice = <T extends string>(value: unknown, values: readonly T[]): T => {
    if (!values.includes(value as T)) throw new Error('Seleccion no valida.');
    return value as T;
  };
  const list = (value: unknown, max = 100): Record<string, unknown>[] => {
    if (!Array.isArray(value) || value.length > max) throw new Error('Lista no valida o demasiado larga.');
    return value.map(record);
  };
  const flag = (value: unknown): boolean => {
    if (typeof value !== 'boolean') throw new Error('Seleccion no valida.');
    return value;
  };
  const customer = record(source.customer);
  const cameras = record(source.cameras);
  const discount = record(source.discount);
  const charge = record(source.charge);
  const deposit = record(source.deposit);
  const overrides = record(source.overrides);
  const result: Order = {
    schemaVersion: 1,
    customer: { name: readText(customer.name, 100), email: readText(customer.email, 120),
      phone: readText(customer.phone, 40), address: readText(customer.address, 300) },
    packageId: choice(source.packageId, ['premium', 'standard']),
    labor: choice(source.labor, ['installed', 'materials']),
    heightFt: num(source.heightFt, 50), embedFt: num(source.embedFt, 20),
    rateCents: optional(source.rateCents, 100_000_000, true),
    spacingFt: optional(source.spacingFt, 100), railCount: optional(source.railCount, 12, true),
    screwsPerPlank: optional(source.screwsPerPlank, 100, true),
    runs: list(source.runs).map((run) => ({ id: readText(run.id, 64), name: readText(run.name, 100),
      lengthFt: num(run.lengthFt), startNode: readText(run.startNode, 64), endNode: readText(run.endNode, 64) })),
    gates: list(source.gates).map((gate) => ({
      id: readText(gate.id, 64), kind: choice(gate.kind, ['plank', 'aluminum']),
      widthFt: num(gate.widthFt, 100), heightFt: num(gate.heightFt, 50),
      runId: readText(gate.runId, 64), offsetFt: num(gate.offsetFt), included: flag(gate.included),
      priceCents: num(gate.priceCents, 100_000_000, true),
      separatePosts: flag(gate.separatePosts), reinforced: flag(gate.reinforced),
    })),
    items: list(source.items).map((item) => ({ id: readText(item.id, 64),
      description: readText(item.description, 300), quantity: num(item.quantity, 100_000),
      unit: readText(item.unit, 30), unitCents: num(item.unitCents, 100_000_000, true), included: flag(item.included) })),
    cameras: { included: num(cameras.included, 100, true), extra: num(cameras.extra, 100, true),
      unitCents: optional(cameras.unitCents, 100_000_000, true) },
    overrides: {}, discount: { kind: choice(discount.kind, ['amount', 'percent']), value: num(discount.value, 100_000_000) },
    charge: { label: readText(charge.label, 100), percent: num(charge.percent, 100) },
    deposit: { kind: choice(deposit.kind, ['amount', 'percent']), value: num(deposit.value, 100_000_000) },
    terms: readText(source.terms, 4000), internalNotes: readText(source.internalNotes, 4000),
  };
  for (const key of ['posts', 'reinforcedPosts', 'railFeet', 'fencePlanks', 'gatePlanks', 'screws'] as const) {
    if (Object.hasOwn(overrides, key)) result.overrides[key] = num(overrides[key], 1_000_000, key !== 'railFeet');
  }
  return result;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Documento no valido.');
  return value as Record<string, unknown>;
}

const feetUnits = (value: number) => Math.round(value * 100);
const feet = (value: number) => Math.round(value) / 100;

export function calculate(order: Order, payments: Payment[] = []): Calculation {
  const issues: string[] = [];
  const pack = fencePackages[order.packageId];
  const rateCents = order.rateCents ?? pack[order.labor] * 100;
  const spacingFt = order.spacingFt ?? pack.postSpacingFt;
  const railCount = order.railCount ?? pack.rails;
  const screwsPerPlank = order.screwsPerPlank ?? pack.screwsPerPicket;
  if (!(order.heightFt > 0) || !(spacingFt >= 0.1) || !(railCount > 0)) issues.push('Altura, separacion y rieles deben ser positivos.');
  if (order.discount.kind === 'percent' && order.discount.value > 100) issues.push('El descuento no puede superar el 100 por ciento.');
  if (order.deposit.kind === 'percent' && order.deposit.value > 100) issues.push('El deposito no puede superar el 100 por ciento.');
  if (order.charge.percent > 0 && !order.charge.label) issues.push('Indica el concepto del cargo.');
  if (order.cameras.extra > 0 && order.cameras.unitCents === null) issues.push('Indica el precio de las camaras adicionales o incluyelas en el acuerdo.');
  const automatic: Record<MaterialKey, number> = { posts: 0, reinforcedPosts: 0, railFeet: 0, fencePlanks: 0, gatePlanks: 0, screws: 0 };
  const nodes = new Set<string>();
  const reinforced = new Set<string>();
  const runIds = new Set<string>();
  const gateIds = new Set<string>();
  let gross = 0;
  let openings = 0;
  let net = 0;
  const point = (run: Run, location: number): string => location === 0 ? run.startNode : location === feetUnits(run.lengthFt) ? run.endNode : run.id + ':' + location;
  for (const run of order.runs) {
    if (!run.id || runIds.has(run.id) || !run.startNode || !run.endNode || run.startNode === run.endNode) issues.push('Identificadores y extremos de tramo no validos.');
    runIds.add(run.id);
    const length = feetUnits(run.lengthFt);
    if (!(length > 0)) { issues.push('Cada tramo debe tener longitud positiva.'); continue; }
    gross += length;
    const gates = order.gates.filter((gate) => gate.runId === run.id).sort((a, b) => a.offsetFt - b.offsetFt);
    let cursor = 0;
    const solid = (start: number, end: number) => {
      if (end <= start) return;
      const distance = end - start;
      net += distance;
      automatic.fencePlanks += Math.ceil(distance / 50);
      const spaces = Math.max(1, Math.ceil(distance / Math.max(10, feetUnits(spacingFt))));
      automatic.posts += spaces - 1;
      nodes.add(point(run, start));
      nodes.add(point(run, end));
    };
    for (const gate of gates) {
      const start = feetUnits(gate.offsetFt);
      const end = start + feetUnits(gate.widthFt);
      if (!(end > start) || start < cursor || end > length) {
        issues.push('Abertura superpuesta o fuera del tramo: ' + run.name);
        continue;
      }
      solid(cursor, start);
      openings += end - start;
      const ends = [point(run, start), point(run, end)];
      if (gate.separatePosts) {
        ends.forEach((node) => { nodes.add(node); nodes.add(gate.id + ':' + node); });
        if (gate.reinforced) ends.forEach((node) => reinforced.add(gate.id + ':' + node));
      } else {
        ends.forEach((node) => nodes.add(node));
        if (gate.reinforced) ends.forEach((node) => reinforced.add(node));
      }
      cursor = end;
    }
    solid(cursor, length);
  }
  for (const gate of order.gates) {
    if (!gate.id || gateIds.has(gate.id)) issues.push('Identificador de gate duplicado.');
    gateIds.add(gate.id);
    if (!(gate.widthFt > 0) || !(gate.heightFt > 0)) issues.push('Los gates deben tener ancho y altura positivos.');
    if (gate.runId && !runIds.has(gate.runId)) issues.push('El gate referencia un tramo inexistente.');
    if (!gate.runId) {
      nodes.add(gate.id + ':start'); nodes.add(gate.id + ':end');
      if (gate.reinforced) { reinforced.add(gate.id + ':start'); reinforced.add(gate.id + ':end'); }
    }
    if (gate.kind === 'plank') automatic.gatePlanks += Math.ceil(feetUnits(gate.widthFt) / 50);
  }
  automatic.posts += nodes.size;
  automatic.reinforcedPosts = reinforced.size;
  automatic.railFeet = feet(net * railCount);
  automatic.screws = ((order.overrides.fencePlanks ?? automatic.fencePlanks) + (order.overrides.gatePlanks ?? automatic.gatePlanks)) * screwsPerPlank;
  const materials = { ...automatic, ...order.overrides };
  if (materials.reinforcedPosts > materials.posts) issues.push('Los postes reforzados son parte del total de postes.');
  const lines: Calculation['lines'] = [];
  if (gross > 0) lines.push({
    description: pack.name + ' fence, ' + (order.labor === 'installed' ? 'installed' : 'materials only'),
    quantity: feet(gross), unit: 'ft', unitCents: rateCents,
    amountCents: Math.round(gross * rateCents / 100), included: false,
  });
  for (const gate of order.gates) lines.push({ description: (gate.kind === 'plank' ? 'Plank gate' : 'Custom aluminium gate') + ' ' + gate.widthFt + ' ft',
    quantity: 1, unit: 'gate', unitCents: gate.priceCents, amountCents: gate.included ? 0 : gate.priceCents, included: gate.included });
  if (order.cameras.included > 0) lines.push({ description: 'Ringbell camera', quantity: order.cameras.included, unit: 'camera', unitCents: 0, amountCents: 0, included: true });
  if (order.cameras.extra > 0) lines.push({ description: 'Additional Ringbell camera', quantity: order.cameras.extra, unit: 'camera',
    unitCents: order.cameras.unitCents ?? 0, amountCents: order.cameras.extra * (order.cameras.unitCents ?? 0), included: false });
  const itemIds = new Set<string>();
  for (const item of order.items) {
    if (!item.id || itemIds.has(item.id) || !item.description || !item.unit) issues.push('Producto o servicio incompleto.');
    itemIds.add(item.id);
    lines.push({ ...item, amountCents: item.included ? 0 : Math.round(item.quantity * item.unitCents) });
  }
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const requestedDiscount = order.discount.kind === 'percent' ? Math.round(subtotalCents * order.discount.value / 100) : Math.round(order.discount.value);
  const discountCents = Math.min(subtotalCents, requestedDiscount);
  const chargeCents = Math.round((subtotalCents - discountCents) * order.charge.percent / 100);
  const totalCents = subtotalCents - discountCents + chargeCents;
  const requestedDeposit = order.deposit.kind === 'percent' ? Math.round(totalCents * order.deposit.value / 100) : Math.round(order.deposit.value);
  if (requestedDeposit > totalCents) issues.push('El deposito no puede superar el total.');
  const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  if (![subtotalCents, totalCents, paidCents].every(Number.isSafeInteger) || totalCents > 1_000_000_000_000) issues.push('Importe fuera de rango.');
  return { issues, grossFt: feet(gross), openingFt: feet(openings), netFt: feet(net), rateCents, spacingFt, railCount, screwsPerPlank,
    automatic, materials, lines, subtotalCents, discountCents, chargeCents, totalCents, depositCents: Math.min(totalCents, requestedDeposit),
    paidCents, balanceCents: totalCents - paidCents };
}

export function issuanceIssues(order: Order): string[] {
  const issues = calculate(order).issues.slice();
  if (!order.customer.name) issues.push('Indica el cliente antes de emitir.');
  if (!order.customer.address) issues.push('Indica la ubicacion del proyecto antes de emitir.');
  if (!order.runs.length && !order.gates.length && !order.items.length) issues.push('Agrega cerca, gate, producto o servicio.');
  return issues;
}

