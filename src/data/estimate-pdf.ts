/** Print / Save PDF and Email PDF share this exact one-page renderer. */
import { formatReceiptMoney } from './estimate.ts';
import { letterTotals, type EstimateLetter } from './estimate-mail.ts';
import { estimateBay } from '../drawing/order-drawing.ts';
import { renderOnePage, type OnePageInput, type PdfBlock } from '../pdf/one-page.ts';

export const estimatePdfName = 'dura-fence-estimate.pdf';

export function estimatePdfInput(letter: EstimateLetter): OnePageInput {
  const result = letter.result, totals = letterTotals(letter);
  const text = (value: string): PdfBlock => ({ kind: 'text', text: value });
  const row = (label: string, value: string, detail = '', strong = false): PdfBlock => ({ kind: 'row', label, value, detail, strong });
  const heading = (value: string): PdfBlock => ({ kind: 'heading', text: value });
  const notes = [...result.materials];
  const present = new Set(notes.map((note) => JSON.stringify(note)));
  for (const group of result.groups) for (const note of group.notes) {
    if (!present.has(JSON.stringify(note))) { notes.push(note); present.add(JSON.stringify(note)); }
  }
  const left: PdfBlock[] = [
    text(result.packageName + ' / ' + result.laborName + '. Rate: ' + formatReceiptMoney(result.ratePerFoot * 100) + ' / ft.'),
    text('Contracted run: ' + (result.runLabel ? result.runLabel + ' ft' : 'none') + '. Payment: ' + (letter.payByCard ? 'Card' : 'Cash') + '.'),
    heading('Materials / gate schedule'),
    ...notes.map((note) => row(note.label, note.value, note.detail)),
    text(result.hasFence
      ? 'Typical detail; representative pickets and fasteners (up to 8 rails shown). Public estimate uses 2 ft embedment. Footing diameter is not specified.'
      : 'Gate / accessory order. No fence elevation applicable.'),
    text('Gate heights and locations are not supplied. No site plan, swing or structural approval is implied.'),
  ];
  const right: PdfBlock[] = [];
  for (const group of result.groups) {
    right.push(heading(group.label));
    for (const line of group.lines) right.push(row(line.label, formatReceiptMoney(line.amountCents), line.detail));
    right.push(row(group.label + ' subtotal', formatReceiptMoney(group.subtotalCents), '', true));
  }
  right.push(heading('Totals'), row('Subtotal', formatReceiptMoney(result.totalCents)));
  if (letter.discount.appliedCents || letter.discount.requestedCents) right.push(row('Discount', formatReceiptMoney(-letter.discount.appliedCents),
    letter.discount.code + ' / ' + (letter.discount.kind === 'percent' ? letter.discount.percent + ' percent' : 'Requested: ' + formatReceiptMoney(letter.discount.requestedCents))));
  right.push(row('Tax', formatReceiptMoney(totals.tax), letter.payByCard ? 'Card, 7 percent' : 'Cash, no tax'),
    row('Total', formatReceiptMoney(totals.due), '', true),
    row('Due with request', formatReceiptMoney(totals.deposit), '25 percent', true));
  const bottom = [text('Card adds 7 percent tax. Cash does not.')];
  if (result.hasFence) bottom.push(text('Corners and gate openings can change the post count. The price follows the footage.'));
  return { title: 'ESTIMATE', reference: '', date: letter.sentOn, customer: letter.customer,
    spec: estimateBay(result, letter.heightFt), left, right, bottom, metadataTitle: 'Dura Fence Metal estimate' };
}

export async function buildEstimatePdf(letter: EstimateLetter): Promise<Uint8Array> {
  return renderOnePage(estimatePdfInput(letter));
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x2000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}
