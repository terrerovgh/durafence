/** Customer details and the letter sent with an estimate. Prices are recomputed here. */

import {
  applyDiscount,
  cardTaxCents,
  depositCents,
  formatFeetInches,
  formatReceiptMoney,
  maxAluminumGates,
  priceEstimate,
  type AluminumGateInput,
  type Discount,
  type Estimate,
  type EstimateInput,
  type ExtraGateId,
  type Labor,
  type PackageId,
} from './estimate.ts';
import { site } from './site.ts';

export const invoiceAddress = 'invoice@durafencemetal.com';

export type EstimateCustomer = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

export type EstimateJob = EstimateInput & {
  heightFt: number;
  payByCard: boolean;
  discountCode: string;
};

export type EstimateLetter = {
  customer: EstimateCustomer;
  result: Estimate;
  heightFt: number;
  payByCard: boolean;
  discount: Discount;
  sentOn: string;
};

export type PreparedEstimate =
  | { ok: true; kind: 'honeypot' }
  | { ok: true; kind: 'letter'; letter: EstimateLetter }
  | { ok: false; status: number; error: string; message: string; fields?: Record<string, string> };

const gateIds: ExtraGateId[] = ['ft12', 'ft6', 'ft3'];

export function customerErrors(customer: EstimateCustomer, requireCustomer = true): Record<string, string> {
  const errors: Record<string, string> = {};
  if ((requireCustomer && !customer.name) || customer.name.length > 100) errors['customer-name'] = 'Enter the customer name.';
  if ((requireCustomer && !customer.address) || customer.address.length > 200) errors['customer-address'] = 'Enter the project address.';
  const digits = customer.phone.replace(/\D/g, '');
  if ((requireCustomer || customer.phone) && (digits.length < 7 || digits.length > 15 || customer.phone.length > 40)) {
    errors['customer-phone'] = 'Enter a phone number.';
  }
  if (customer.email.length > 120 || ((requireCustomer || customer.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) {
    errors['customer-email'] = 'Enter the customer email.';
  }
  return errors;
}

export function formatSentOn(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function prepareEstimateLetter(input: unknown, sentOn: string, requireCustomer = true): PreparedEstimate {
  if (!isRecord(input)) return invalid('The estimate could not be read.');
  if (oneLine(input.df_leave_blank).length > 0) return { ok: true, kind: 'honeypot' };

  const customer = readCustomer(input.customer);
  if (!customer) return invalid('The estimate could not be read.');
  const fields = customerErrors(customer, requireCustomer);

  const job = readJob(input.estimate);
  if (!job) return invalid('The estimate could not be read.');
  if (job.heightFt < 3 || job.heightFt > 12) fields.height = 'Enter a height from 3 to 12 feet.';
  if (job.discountCode.length > 12) fields.discount = 'That code is not one we use.';
  if (Object.keys(fields).length > 0) {
    const onlyCustomer = Object.keys(fields).every((key) => key.startsWith('customer-'));
    return {
      ok: false,
      status: 400,
      error: 'invalid',
      message: onlyCustomer ? 'Check the customer details.' : 'Fix the estimate before sending it.',
      fields,
    };
  }

  const result = priceEstimate(job);
  if (result.issues.length > 0) {
    const issueFields: Record<string, string> = {};
    for (const issue of result.issues) issueFields[issue.field] = issue.message;
    return {
      ok: false,
      status: 400,
      error: 'invalid',
      message: 'Fix the estimate before sending it.',
      fields: issueFields,
    };
  }
  if (result.empty) {
    return { ok: false, status: 400, error: 'empty', message: 'Enter a length or add a gate.' };
  }

  const discount = applyDiscount(result.totalCents, job.discountCode);
  if (discount.kind === 'invalid') {
    return {
      ok: false,
      status: 400,
      error: 'discount',
      message: discount.error,
      fields: { discount: discount.error },
    };
  }

  return {
    ok: true,
    kind: 'letter',
    letter: {
      customer,
      result,
      heightFt: job.heightFt,
      payByCard: job.payByCard,
      discount,
      sentOn,
    },
  };
}

export function draftEstimateEmail(letter: EstimateLetter): { subject: string; text: string; html: string } {
  const { customer, result } = letter;
  const figures = figureLines(letter);
  const subject = `Estimate for ${customer.name}`;
  const text = [
    `Hello ${customer.name},`,
    '',
    `Attached is your Dura Fence Metal estimate for the project at ${customer.address}.`,
    `We will use ${customer.phone} and ${customer.email} if anything on the sheet needs a change.`,
    '',
    'Customer',
    `Name: ${customer.name}`,
    `Address: ${customer.address}`,
    `Phone: ${customer.phone}`,
    `Email: ${customer.email}`,
    '',
    'Estimate',
    `Date: ${letter.sentOn}`,
    `Package: ${result.packageName}, ${result.laborName}`,
    `Height: ${formatFeetInches(letter.heightFt)}`,
    `Run: ${result.runLabel ? `${result.runLabel} ft` : 'No fence run'}`,
    `Payment: ${letter.payByCard ? 'Card' : 'Cash'}`,
    ...figures,
    '',
    'The price follows the footage on the attached PDF. A measurement on site comes before the work starts.',
    '',
    site.name,
    site.region,
    site.phone,
    invoiceAddress,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f4f1ea;color:#1c1c1c;font:16px/1.5 Georgia,serif">
<main style="max-width:36rem;margin:0 auto;padding:2rem 1.25rem">
<p>Hello ${escapeHtml(customer.name)},</p>
<p>Attached is your Dura Fence Metal estimate for the project at ${escapeHtml(customer.address)}. We will use ${escapeHtml(customer.phone)} and ${escapeHtml(customer.email)} if anything on the sheet needs a change.</p>
<p><strong>Customer</strong><br>Name: ${escapeHtml(customer.name)}<br>Address: ${escapeHtml(customer.address)}<br>Phone: ${escapeHtml(customer.phone)}<br>Email: ${escapeHtml(customer.email)}</p>
<p><strong>Estimate</strong><br>Date: ${escapeHtml(letter.sentOn)}<br>Package: ${escapeHtml(result.packageName)}, ${escapeHtml(result.laborName)}<br>Height: ${escapeHtml(formatFeetInches(letter.heightFt))}<br>Run: ${escapeHtml(result.runLabel ? `${result.runLabel} ft` : 'No fence run')}<br>Payment: ${letter.payByCard ? 'Card' : 'Cash'}<br>${figures.map((line) => escapeHtml(line)).join('<br>')}</p>
<p>The price follows the footage on the attached PDF. A measurement on site comes before the work starts.</p>
<p>${escapeHtml(site.name)}<br>${escapeHtml(site.region)}<br>${escapeHtml(site.phone)}<br>${escapeHtml(invoiceAddress)}</p>
</main></body></html>`;

  return { subject, text, html };
}

export function letterTotals(letter: EstimateLetter): { net: number; tax: number; due: number; deposit: number } {
  const net = letter.result.totalCents - letter.discount.appliedCents;
  const tax = cardTaxCents(net, letter.payByCard);
  const due = net + tax;
  return { net, tax, due, deposit: depositCents(due) };
}

function figureLines(letter: EstimateLetter): string[] {
  const { discount } = letter;
  const { tax, due, deposit } = letterTotals(letter);
  const lines = [`Subtotal: ${formatReceiptMoney(letter.result.totalCents)}`];
  if (discount.appliedCents > 0) {
    const off = discount.kind === 'percent' ? `${discount.percent}% off` : `${formatReceiptMoney(discount.requestedCents)} off`;
    lines.push(`Discount ${discount.code}: -${formatReceiptMoney(discount.appliedCents)} (${off})`);
  }
  lines.push(letter.payByCard ? `Tax (card, 7%): ${formatReceiptMoney(tax)}` : `Tax: ${formatReceiptMoney(0)}`);
  lines.push(`Total: ${formatReceiptMoney(due)}`);
  lines.push(`Due with request (25%): ${formatReceiptMoney(deposit)}`);
  return lines;
}

function invalid(message: string): PreparedEstimate {
  return { ok: false, status: 400, error: 'invalid', message };
}

function readCustomer(value: unknown): EstimateCustomer | null {
  if (!isRecord(value)) return null;
  return {
    name: oneLine(value.name),
    address: oneLine(value.address),
    phone: oneLine(value.phone),
    email: oneLine(value.email),
  };
}

function readJob(value: unknown): EstimateJob | null {
  if (!isRecord(value)) return null;
  const lengthFt = finite(value.lengthFt);
  const heightFt = finite(value.heightFt);
  const extraScrewLb = finite(value.extraScrewLb);
  if (lengthFt === null || heightFt === null || extraScrewLb === null) return null;
  if (value.packageId !== 'premium' && value.packageId !== 'standard') return null;
  if (value.labor !== 'installed' && value.labor !== 'materials') return null;
  if (typeof value.payByCard !== 'boolean') return null;
  if (typeof value.discountCode !== 'string') return null;
  if (!isRecord(value.extraGates) || !Array.isArray(value.aluminumGates)) return null;

  const extraGates = { ft12: 0, ft6: 0, ft3: 0 };
  for (const id of gateIds) {
    const count = finite(value.extraGates[id] ?? 0);
    if (count === null) return null;
    extraGates[id] = count;
  }

  const aluminumGates: AluminumGateInput[] = [];
  for (const gate of value.aluminumGates.slice(0, maxAluminumGates)) {
    if (!isRecord(gate)) return null;
    const widthFt = finite(gate.widthFt);
    if (widthFt === null) return null;
    if (gate.labor !== 'installed' && gate.labor !== 'materials') return null;
    aluminumGates.push({ widthFt, labor: gate.labor });
  }

  const packageId: PackageId = value.packageId;
  const labor: Labor = value.labor;
  return {
    lengthFt,
    heightFt,
    packageId,
    labor,
    extraGates,
    extraScrewLb,
    aluminumGates,
    payByCard: value.payByCard,
    discountCode: value.discountCode.trim(),
  };
}

function oneLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function finite(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
