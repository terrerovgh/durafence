/** Package rates and the material count for a Dura Fence Metal estimate. */

export type PackageId = 'premium' | 'standard';
export type Labor = 'installed' | 'materials';
export type ExtraGateId = 'ft12' | 'ft6' | 'ft3';

export type AluminumGateInput = {
  widthFt: number;
  labor: Labor;
};

export type EstimateInput = {
  lengthFt: number;
  packageId: PackageId;
  labor: Labor;
  extraGates: Record<ExtraGateId, number>;
  extraScrewLb: number;
  aluminumGates: AluminumGateInput[];
};

export type SheetLine = {
  label: string;
  detail: string;
  value: string;
};

export type PriceLine = {
  label: string;
  detail: string;
  amountCents: number;
};

export type PriceGroup = {
  id: string;
  label: string;
  lines: PriceLine[];
  notes: SheetLine[];
  subtotalCents: number;
};

export type FieldIssue = {
  field: string;
  message: string;
};

export type Estimate = {
  materials: SheetLine[];
  prices: PriceLine[];
  groups: PriceGroup[];
  totalCents: number;
  includedScrews: number;
  screwsPerPicket: number;
  ratePerFoot: number;
  packageName: string;
  laborName: string;
  postSpacingFt: number;
  railCount: number;
  runLabel: string;
  hasFence: boolean;
  empty: boolean;
  issues: FieldIssue[];
};

type FencePackage = {
  id: PackageId;
  name: string;
  installed: number;
  materials: number;
  postSpacingFt: number;
  rails: number;
  screwsPerPicket: number;
};

export const picketWidthIn = 6;
export const includedGateFt = 12;
export const screwPricePerLb = 150;
export const maxLengthFt = 5000;
export const maxScrewLb = 10000;
export const maxGateQty = 99;
export const maxAluminumGates = 12;

export const fencePackages: Record<PackageId, FencePackage> = {
  premium: {
    id: 'premium',
    name: 'Premium',
    installed: 40,
    materials: 25,
    postSpacingFt: 4,
    rails: 3,
    screwsPerPicket: 3,
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    installed: 35,
    materials: 20,
    postSpacingFt: 6,
    rails: 2,
    screwsPerPicket: 2,
  },
};

export const extraGateCatalog: { id: ExtraGateId; widthFt: number; price: number; name: string }[] = [
  { id: 'ft12', widthFt: 12, price: 1000, name: '12 ft gate' },
  { id: 'ft6', widthFt: 6, price: 500, name: '6 ft gate' },
  { id: 'ft3', widthFt: 3, price: 250, name: '3 ft gate' },
];

export const aluminumRate = {
  installed: 300,
  materials: 250,
  postSpacingFt: 4,
};

export const ESTIMATE_STORAGE_KEY = 'durafence-estimate';

export function laborName(labor: Labor): string {
  return labor === 'installed' ? 'installed' : 'materials only';
}

export function packageSpec(id: PackageId): string {
  const pack = fencePackages[id];
  return `${formatMoney(pack.installed * 100)}/ft installed, or ${formatMoney(pack.materials * 100)}/ft for materials only. ${picketWidthIn} in pickets, side by side. Posts every ${pack.postSpacingFt} ft. ${pack.rails} rails. ${pack.screwsPerPicket} screws per picket. One ${includedGateFt} ft gate included.`;
}

export function formatMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const withCommas = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = rem === 0 ? withCommas : `${withCommas}.${String(rem).padStart(2, '0')}`;
  return `${negative ? '-' : ''}$${body}`;
}

/** 25% of the order, rounded to the cent, due when the request is sent. */
export function depositCents(totalCents: number): number {
  return Math.round((totalCents * 25) / 100);
}

/** Card payments add 7% tax. Cash does not. */
export function cardTaxCents(subtotalCents: number, payByCard: boolean): number {
  if (!payByCard) return 0;
  return Math.round((subtotalCents * 7) / 100);
}

export type Discount = {
  code: string;
  kind: 'none' | 'dollars' | 'percent' | 'invalid';
  requestedCents: number;
  appliedCents: number;
  percent: number;
  error: string;
};

/** ABE plus a number takes that many dollars off. DURA plus a number takes that percent off. */
export function applyDiscount(subtotalCents: number, raw: string): Discount {
  const code = raw.trim().toUpperCase();
  const none: Discount = { code: '', kind: 'none', requestedCents: 0, appliedCents: 0, percent: 0, error: '' };
  if (!code) return none;

  const dollars = /^ABE(\d{1,7})$/.exec(code);
  const percent = /^DURA(\d{1,3})$/.exec(code);
  if (!dollars && !percent) {
    return { ...none, code, kind: 'invalid', error: 'That code is not one we use.' };
  }

  if (dollars) {
    const amount = Number(dollars[1]);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return { ...none, code, kind: 'invalid', error: 'That code is not one we use.' };
    }
    const requestedCents = amount * 100;
    return {
      code,
      kind: 'dollars',
      requestedCents,
      appliedCents: Math.min(Math.max(0, subtotalCents), requestedCents),
      percent: 0,
      error: '',
    };
  }

  const rate = Number(percent?.[1]);
  if (!Number.isSafeInteger(rate) || rate <= 0 || rate > 100) {
    return { ...none, code, kind: 'invalid', error: 'That code is not one we use.' };
  }
  const requestedCents = Math.round((Math.max(0, subtotalCents) * rate) / 100);
  return { code, kind: 'percent', requestedCents, appliedCents: requestedCents, percent: rate, error: '' };
}

export function amountDueCents(subtotalCents: number, payByCard: boolean, code = ''): number {
  const net = subtotalCents - applyDiscount(subtotalCents, code).appliedCents;
  return net + cardTaxCents(net, payByCard);
}

export function paymentSummary(subtotalCents: number, payByCard: boolean, code = ''): string {
  const discount = applyDiscount(subtotalCents, code);
  const net = subtotalCents - discount.appliedCents;
  const tax = cardTaxCents(net, payByCard);
  const due = net + tax;
  const lines = [
    `Payment: ${payByCard ? 'card' : 'cash'}`,
    payByCard ? `Tax (7%): ${formatMoney(tax)}` : 'Tax: $0',
    `Total due: ${formatMoney(due)}`,
    `Due with request (25%): ${formatMoney(depositCents(due))}`,
  ];
  if (discount.appliedCents > 0) {
    lines.unshift(`Discount ${discount.code}: -${formatMoney(discount.appliedCents)}`);
  }
  return lines.join('\n');
}

export function formatReceiptMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const withCommas = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${withCommas}.${String(rem).padStart(2, '0')}`;
}

/** Shop-drawing feet and inches, such as 4'-0" or 6". */
export function formatFeetInches(feet: number): string {
  const totalInches = Math.round(feet * 12);
  const whole = Math.floor(Math.abs(totalInches) / 12);
  const inches = Math.abs(totalInches) % 12;
  const sign = totalInches < 0 ? '-' : '';
  if (whole === 0) return `${sign}${inches}"`;
  return `${sign}${whole}'-${inches}"`;
}

/** Posts on one straight run, including both ends. A short last bay still gets an end post. */
export function postsForRun(lengthFt: number, spacingFt: number): number {
  if (!(lengthFt > 0) || !(spacingFt > 0)) return 0;
  const length = Math.round(lengthFt * 100);
  const spacing = Math.round(spacingFt * 100);
  return Math.ceil(length / spacing) + 1;
}

export function priceEstimate(input: EstimateInput): Estimate {
  const issues: FieldIssue[] = [];
  const packageId: PackageId = input.packageId === 'standard' ? 'standard' : 'premium';
  const labor: Labor = input.labor === 'materials' ? 'materials' : 'installed';
  const pack = fencePackages[packageId];
  const ratePerFoot = pack[labor];

  const lengthHundredths = cleanFeet(input.lengthFt, 'length', 'Enter a length up to 5,000 feet.', issues);
  const screwHundredths = cleanPounds(input.extraScrewLb, issues);
  const materials: SheetLine[] = [];
  const fenceLines: PriceLine[] = [];
  const fenceNotes: SheetLine[] = [];
  const gateLines: PriceLine[] = [];
  const screwLines: PriceLine[] = [];
  const screwNotes: SheetLine[] = [];
  const aluminumLines: PriceLine[] = [];
  const aluminumNotes: SheetLine[] = [];

  if (lengthHundredths > 0) {
    const pickets = Math.ceil(lengthHundredths / 50);
    const posts = postsForRun(lengthHundredths / 100, pack.postSpacingFt);
    const screws = pickets * pack.screwsPerPicket;
    const lengthLabel = formatHundredths(lengthHundredths);

    fenceNotes.push(
      { label: '6 in pickets', detail: 'side by side', value: String(pickets) },
      { label: 'Line posts', detail: `every ${pack.postSpacingFt} ft`, value: String(posts) },
      { label: 'Rails', detail: '', value: `${pack.rails} × ${lengthLabel} ft` },
      { label: 'Screws, included', detail: `${pack.screwsPerPicket} per picket`, value: String(screws) },
      {
        label: `${includedGateFt} ft gate, included`,
        detail: 'hinge post, latch post, and closure',
        value: '1',
      },
      { label: 'Ringbell camera', detail: 'included', value: '1' },
    );
    materials.push(...fenceNotes);

    fenceLines.push({
      label: `${pack.name} fence, ${laborName(labor)}`,
      detail: `${lengthLabel} ft × ${formatMoney(ratePerFoot * 100)}`,
      amountCents: lengthHundredths * ratePerFoot,
    });
  }

  for (const gate of extraGateCatalog) {
    const qty = cleanCount(input.extraGates?.[gate.id] ?? 0, gate.id, issues);
    if (qty <= 0) continue;
    const note = { label: gate.name, detail: 'added opening', value: String(qty) };
    materials.push(note);
    gateLines.push({
      label: gate.name,
      detail: `${qty} × ${formatMoney(gate.price * 100)}`,
      amountCents: qty * gate.price * 100,
    });
  }

  if (screwHundredths > 0) {
    screwNotes.push({
      label: 'Extra screws',
      detail: `${formatMoney(screwPricePerLb * 100)}/lb`,
      value: `${formatHundredths(screwHundredths)} lb`,
    });
    materials.push(...screwNotes);
    screwLines.push({
      label: 'Extra screws',
      detail: `${formatHundredths(screwHundredths)} lb × ${formatMoney(screwPricePerLb * 100)}`,
      amountCents: screwHundredths * screwPricePerLb,
    });
  }

  const aluminum = Array.isArray(input.aluminumGates) ? input.aluminumGates.slice(0, maxAluminumGates) : [];
  const pricedAluminum = aluminum.flatMap((gate, index) => {
    const widthHundredths = cleanFeet(
      gate?.widthFt ?? 0,
      `aluminum-${index}`,
      'Enter a width up to 5,000 feet.',
      issues,
      true,
    );
    if (widthHundredths <= 0) return [];
    return [{ index, widthHundredths, labor: gate?.labor === 'materials' ? 'materials' as const : 'installed' as const }];
  });

  pricedAluminum.forEach((gate, position) => {
    const many = pricedAluminum.length > 1;
    const suffix = many ? ` ${position + 1}` : '';
    const rate = aluminumRate[gate.labor];
    const widthFt = gate.widthHundredths / 100;
    const posts = postsForRun(widthFt, aluminumRate.postSpacingFt);
    const widthLabel = formatHundredths(gate.widthHundredths);

    const gateNote = {
      label: `Aluminum woven gate${suffix}`,
      detail: laborName(gate.labor),
      value: `${widthLabel} ft`,
    };
    const postNote = {
      label: `Aluminum posts${suffix}`,
      detail: `every ${aluminumRate.postSpacingFt} ft`,
      value: String(posts),
    };
    const closureNote = { label: `Closure${suffix}`, detail: '', value: '1' };
    materials.push(gateNote, postNote, closureNote);
    aluminumNotes.push(postNote, closureNote);
    aluminumLines.push({
      label: `Aluminum woven gate${suffix}, ${laborName(gate.labor)}`,
      detail: `${widthLabel} ft × ${formatMoney(rate * 100)}`,
      amountCents: gate.widthHundredths * rate,
    });
  });

  const groups = [
    makeGroup('fence', 'Fence', fenceLines, fenceNotes),
    makeGroup('gates', 'Gates', gateLines, []),
    makeGroup('screws', 'Screws', screwLines, []),
    makeGroup('aluminum', 'Aluminum', aluminumLines, aluminumNotes),
  ].filter((group): group is PriceGroup => group !== null);
  const prices = groups.flatMap((group) => group.lines);
  const totalCents = prices.reduce((sum, line) => sum + line.amountCents, 0);
  const pickets = lengthHundredths > 0 ? Math.ceil(lengthHundredths / 50) : 0;

  return {
    materials,
    prices,
    groups,
    totalCents,
    includedScrews: pickets * pack.screwsPerPicket,
    screwsPerPicket: pack.screwsPerPicket,
    ratePerFoot,
    packageName: pack.name,
    laborName: laborName(labor),
    postSpacingFt: pack.postSpacingFt,
    railCount: pack.rails,
    runLabel: lengthHundredths > 0 ? formatHundredths(lengthHundredths) : '',
    hasFence: lengthHundredths > 0,
    empty: materials.length === 0 && prices.length === 0,
    issues,
  };
}

export function rateLine(result: Estimate): string {
  return `${result.packageName}, ${result.laborName}: ${formatMoney(result.ratePerFoot * 100)} per foot. A ${includedGateFt} ft gate is included with the fence.`;
}

export function screwLine(result: Estimate): string {
  const price = `${formatMoney(screwPricePerLb * 100)} a pound`;
  if (result.hasFence) {
    return `This length includes ${formatCount(result.includedScrews)} screws, ${result.screwsPerPicket} on each picket. More are weighed at ${price}.`;
  }
  return `${result.packageName} includes ${result.screwsPerPicket} screws on each picket. More are weighed at ${price}.`;
}

export function estimateSummary(result: Estimate): string {
  if (result.empty && result.issues.length === 0) return '';
  const lines = ['Dura Fence Metal — package estimate'];
  for (const line of result.materials) {
    lines.push(`${line.label}: ${line.value}${line.detail ? ` (${line.detail})` : ''}`);
  }
  for (const line of result.prices) {
    lines.push(`${line.label}: ${formatMoney(line.amountCents)}${line.detail ? ` (${line.detail})` : ''}`);
  }
  for (const group of result.groups) {
    lines.push(`${group.label} subtotal: ${formatMoney(group.subtotalCents)}`);
  }
  lines.push(`Subtotal: ${formatMoney(result.totalCents)}`);
  lines.push(`Preliminary total: ${formatMoney(result.totalCents)}`);
  if (result.hasFence) {
    lines.push('Corners, and a gate opening taken out of this length, can change the post count. The price follows the footage.');
  }
  for (const issue of result.issues) lines.push(`Left out: ${issue.message}`);
  return lines.join('\n');
}

function makeGroup(id: string, label: string, lines: PriceLine[], notes: SheetLine[]): PriceGroup | null {
  if (lines.length === 0) return null;
  return {
    id,
    label,
    lines,
    notes,
    subtotalCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
  };
}

function cleanFeet(value: number, field: string, message: string, issues: FieldIssue[], blankOk = false): number {
  if (blankOk && (value === 0 || value === undefined)) return 0;
  if (!Number.isFinite(value) || value < 0) {
    issues.push({ field, message });
    return 0;
  }
  const hundredths = Math.round(value * 100);
  if (hundredths > maxLengthFt * 100) {
    issues.push({ field, message });
    return 0;
  }
  return hundredths;
}

function cleanPounds(value: number, issues: FieldIssue[]): number {
  if (value === 0) return 0;
  if (!Number.isFinite(value) || value < 0 || Math.round(value * 100) > maxScrewLb * 100) {
    issues.push({ field: 'screws', message: 'Enter a weight up to 10,000 pounds.' });
    return 0;
  }
  return Math.round(value * 100);
}

function cleanCount(value: number, field: string, issues: FieldIssue[]): number {
  if (value === 0) return 0;
  if (!Number.isInteger(value) || value < 0 || value > maxGateQty) {
    issues.push({ field, message: 'Enter a whole number of gates, up to 99.' });
    return 0;
  }
  return value;
}

function formatCount(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatHundredths(hundredths: number): string {
  const whole = Math.floor(Math.abs(hundredths) / 100);
  const frac = Math.abs(hundredths) % 100;
  if (frac === 0) return String(whole);
  if (frac % 10 === 0) return `${whole}.${frac / 10}`;
  return `${whole}.${String(frac).padStart(2, '0')}`;
}
