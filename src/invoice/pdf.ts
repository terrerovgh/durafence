import { renderOnePage, LETTER, safePdfText, type OnePageInput, type PdfBlock } from '../pdf/one-page.ts';
import { invoiceBay } from '../drawing/order-drawing.ts';
import { site } from '../data/site.ts';
import { calculate, money, type StoredInvoice } from './model.ts';

export const PAPER = LETTER;
export const pdfText = safePdfText;

export function invoicePdfInput(invoice: StoredInvoice): OnePageInput {
  const order = invoice.order, result = calculate(order, invoice.payments);
  const text = (value: string): PdfBlock => ({ kind: 'text', text: value });
  const row = (label: string, value: string, detail = '', strong = false): PdfBlock => ({ kind: 'row', label, value, detail, strong });
  const heading = (value: string): PdfBlock => ({ kind: 'heading', text: value });
  const left: PdfBlock[] = [
    text((order.packageId === 'standard' ? 'Standard' : 'Premium') + ' / ' + (order.labor === 'installed' ? 'Installed' : 'Materials only') + '. Rate: ' + money(result.rateCents) + ' / ft.'),
    text('Contracted: ' + result.grossFt + ' ft; openings: ' + result.openingFt + ' ft; solid fence: ' + result.netFt + ' ft.'),
    heading('Materials'),
    text('Posts: ' + result.materials.posts + ' total (' + result.materials.reinforcedPosts + ' reinforced, within total). Rails: ' + result.materials.railFeet + ' linear ft.'),
    text('Fence planks: ' + result.materials.fencePlanks + '; gate planks: ' + result.materials.gatePlanks + '; screws: ' + result.materials.screws + '.'),
    text('Cameras: ' + order.cameras.included + ' included + ' + order.cameras.extra + ' extra.'),
    heading('Runs / gate dimensions'),
    ...order.runs.map((run, i) => text('Run ' + (i + 1) + ' (' + run.name + '): ' + run.lengthFt + ' ft.')),
    ...(order.gates.length ? order.gates.map((gate, i) => text('Gate ' + (i + 1) + ': ' + (gate.kind === 'plank' ? 'Plank' : 'Custom aluminum') +
      ', ' + gate.widthFt + ' ft wide x ' + gate.heightFt + ' ft high; ' +
      (gate.runId ? 'run ' + (order.runs.findIndex((run) => run.id === gate.runId) + 1) + ' at ' + gate.offsetFt + ' ft' : 'standalone') + '; ' +
      (gate.separatePosts ? 'separate posts' : gate.runId ? 'shared posts' : 'own posts') + (gate.reinforced ? ', reinforced.' : '.')))
      : [text('No gates specified.')]),
    text('Fence rails exclude gate openings. Gate frames and fittings are supplied as gate components.'),
    text(result.netFt > 0
      ? 'Typical detail only; pickets and fasteners are representative (up to 8 rails shown). Footing diameter is not specified. No site plan, swing or structural approval is implied.'
      : 'No fence elevation. Gate dimensions only; no site plan, swing or structural approval is implied.'),
  ];
  const right: PdfBlock[] = [
    heading('Items / agreed prices'),
    ...result.lines.map((item) => row(item.description.replace(/^Custom aluminium gate/, 'Custom aluminum gate'), item.included ? 'Included' : money(item.amountCents),
      item.quantity + ' ' + item.unit + (item.included ? '' : ' x ' + money(item.unitCents)))),
    heading('Totals'),
    row('Subtotal', money(result.subtotalCents)),
    ...(order.discount.value || result.discountCents ? [row('Discount', money(-result.discountCents),
      order.discount.kind === 'percent' ? order.discount.value + ' percent' : 'Requested: ' + money(order.discount.value))] : []),
    ...(order.charge.label || order.charge.percent || result.chargeCents ? [row(order.charge.label || 'Charge', money(result.chargeCents), order.charge.percent + ' percent')] : []),
    row('Total', money(result.totalCents), '', true),
    row('Agreed deposit', money(result.depositCents), order.deposit.kind === 'percent' ? order.deposit.value + ' percent' : ''),
    row('Payments received', money(result.paidCents)), row('Balance', money(result.balanceCents), '', true),
  ];
  const bottom: PdfBlock[] = [];
  if (invoice.payments.length) {
    bottom.push(heading('Payments / reversals'));
    invoice.payments.forEach((payment, i) => {
      const reversed = payment.reverses ? invoice.payments.findIndex((candidate) => candidate.id === payment.reverses) : -1;
      bottom.push(row('Payment ' + (i + 1) + ': ' + payment.date + ' / ' + payment.method, money(payment.amountCents),
        (payment.reverses ? 'Reversal of payment ' + (reversed >= 0 ? reversed + 1 : payment.reverses) + '. ' : '') + payment.note));
    });
  }
  if (order.terms) bottom.push(heading('Terms'), text(order.terms));
  return {
    title: invoice.kind === 'invoice' ? 'INVOICE' : 'ESTIMATE', reference: invoice.number,
    date: invoice.updatedAt.slice(0, 10), revision: invoice.version, customer: order.customer,
    spec: invoiceBay(order, result), left, right, bottom,
    metadataTitle: site.name + ' ' + invoice.number, createdAt: invoice.createdAt, updatedAt: invoice.updatedAt,
  };
}

export async function buildInvoicePdf(invoice: StoredInvoice): Promise<Uint8Array> {
  return renderOnePage(invoicePdfInput(invoice));
}
