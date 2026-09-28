/** Letter-size PDF of a priced estimate. The drawing stays on the printed sheet. */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { formatFeetInches, formatReceiptMoney } from './estimate.ts';
import { letterTotals, type EstimateLetter } from './estimate-mail.ts';
import { site } from './site.ts';

const pageWidth = 612;
const pageHeight = 792;
const margin = 40;
const contentWidth = pageWidth - margin * 2;
const ink = rgb(0.067, 0.067, 0.067);
const muted = rgb(0.33, 0.33, 0.33);
const gold = rgb(0.725, 0.522, 0.294);
const rule = rgb(0.72, 0.68, 0.62);

export const estimatePdfName = 'dura-fence-estimate.pdf';

export async function buildEstimatePdf(letter: EstimateLetter): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Dura Fence Metal estimate');
  doc.setAuthor(site.name);
  doc.setCreator(site.name);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sheet = new Sheet(doc, regular, bold);
  sheet.draw(letter);
  return doc.save();
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x2000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

class Sheet {
  private page: PDFPage;
  private y = 0;
  private doc: PDFDocument;
  private regular: PDFFont;
  private bold: PDFFont;

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.page = doc.addPage([pageWidth, pageHeight]);
    this.chrome(false);
  }

  draw(letter: EstimateLetter): void {
    const { customer, result } = letter;
    this.pair('DURA FENCE METAL', 'INVOICE', 14, this.bold, ink);
    this.gap(2);
    this.pair(site.region, letter.sentOn, 10, this.regular, muted);
    this.line(`${site.phone}  /  durafencemetal.com`, 9, this.regular, muted);
    this.gap(8);
    this.horizontal(gold, 1.4);
    this.gap(12);

    const left = this.column(
      ['BILL TO', customer.name, customer.phone, customer.email],
      margin,
      contentWidth / 2 - 12,
    );
    const right = this.column(
      ['PROJECT LOCATION', customer.address],
      margin + contentWidth / 2,
      contentWidth / 2,
    );
    this.y = Math.min(left, right) - 8;
    this.horizontal(rule, 0.6);
    this.gap(8);

    this.heading('Order');
    this.moneyLine('Package', result.packageName);
    this.moneyLine('Labor', result.laborName);
    this.moneyLine('Height', formatFeetInches(letter.heightFt));
    this.moneyLine('Run', result.runLabel ? `${result.runLabel} ft` : 'No fence run');
    this.moneyLine('Rate', `${formatReceiptMoney(result.ratePerFoot * 100)} / ft`);
    this.moneyLine('Payment', letter.payByCard ? 'Card' : 'Cash');

    for (const group of result.groups) {
      this.gap(8);
      this.heading(group.label);
      for (const line of group.lines) this.moneyLine(line.label, formatReceiptMoney(line.amountCents), line.detail);
      for (const note of group.notes) this.moneyLine(note.label, note.value, note.detail);
      this.moneyLine(`${group.label} subtotal`, formatReceiptMoney(group.subtotalCents), '', true);
    }

    const totals = letterTotals(letter);
    this.need(168);
    this.gap(10);
    this.horizontal(ink, 1);
    this.gap(6);
    this.moneyLine('Subtotal', formatReceiptMoney(result.totalCents), '', true);
    if (letter.discount.appliedCents > 0) {
      const off = letter.discount.kind === 'percent'
        ? `${letter.discount.percent}% off`
        : `${formatReceiptMoney(letter.discount.requestedCents)} off`;
      this.moneyLine('Discount', formatReceiptMoney(-letter.discount.appliedCents), `${letter.discount.code}, ${off}`);
    }
    this.moneyLine('Tax', formatReceiptMoney(totals.tax), letter.payByCard ? 'Card, 7%' : 'Cash');
    this.moneyLine('Total', formatReceiptMoney(totals.due), '', true);
    this.moneyLine('Due with request', formatReceiptMoney(totals.deposit), '25% of the total', true);

    this.gap(12);
    const install = result.hasFence
      ? `${result.packageName}, ${result.laborName}. Posts spaced ${formatFeetInches(result.postSpacingFt)} on center, ${result.railCount} rails per bay and ${result.screwsPerPicket} screws per picket.`
      : 'No fence run in this order. Gate and accessory specifications are itemized above.';
    this.paragraph(install, 9, muted);
    if (result.hasFence && letter.heightFt !== 6) {
      this.paragraph(
        `Requested height: ${formatFeetInches(letter.heightFt)}. Confirm the final height and post specification before fabrication.`,
        9,
        muted,
      );
    }
    if (result.hasFence) {
      this.paragraph(
        'Corners, and a gate opening taken out of this length, can change the post count. The price follows the footage.',
        9,
        muted,
      );
    }
    this.paragraph('A measurement on site comes before the work starts. Card adds 7% tax. Cash does not.', 9, muted);
    this.gap(8);
    this.paragraph(`${site.name} / ${site.region}`, 9, muted);
    this.paragraph('Thank you for choosing Dura Fence Metal.', 9, muted);
  }

  private chrome(continued: boolean): void {
    this.page.drawRectangle({ x: 0, y: pageHeight - 8, width: pageWidth, height: 8, color: gold });
    if (continued) {
      this.page.drawText('Dura Fence Metal  /  estimate continued', {
        x: margin,
        y: pageHeight - 28,
        size: 9,
        font: this.regular,
        color: muted,
      });
      this.y = pageHeight - 44;
      return;
    }
    this.y = pageHeight - 36;
  }

  private nextPage(): void {
    this.page = this.doc.addPage([pageWidth, pageHeight]);
    this.chrome(true);
  }

  private need(height: number): void {
    if (this.y - height >= 48) return;
    this.nextPage();
  }

  private gap(amount: number): void {
    this.y -= amount;
  }

  private horizontal(color: RGB, thickness: number): void {
    this.need(thickness + 2);
    this.page.drawLine({
      start: { x: margin, y: this.y },
      end: { x: margin + contentWidth, y: this.y },
      thickness,
      color,
    });
  }

  private line(text: string, size: number, font: PDFFont, color: RGB, x = margin, width = contentWidth): void {
    for (const part of wrap(pdfText(text), font, size, width)) {
      this.need(size + 4);
      this.page.drawText(part, { x, y: this.y - size, size, font, color });
      this.y -= size + 3;
    }
  }

  private pair(left: string, right: string, size: number, font: PDFFont, color: RGB): void {
    this.need(size + 4);
    const safeLeft = pdfText(left);
    const safeRight = pdfText(right);
    this.page.drawText(safeLeft, { x: margin, y: this.y - size, size, font, color });
    const rightWidth = font.widthOfTextAtSize(safeRight, size);
    this.page.drawText(safeRight, {
      x: margin + contentWidth - rightWidth,
      y: this.y - size,
      size,
      font,
      color,
    });
    this.y -= size + 3;
  }

  private column(lines: string[], x: number, width: number): number {
    let y = this.y;
    lines.forEach((text, index) => {
      const font = index === 0 ? this.bold : this.regular;
      const size = index === 0 ? 8 : index === 1 ? 11 : 10;
      const color = index === 0 ? gold : ink;
      for (const part of wrap(pdfText(text), font, size, width)) {
        this.page.drawText(part, { x, y: y - size, size, font, color });
        y -= size + 3;
      }
      if (index === 0) y -= 3;
    });
    return y;
  }

  private heading(text: string): void {
    this.gap(4);
    this.line(text.toUpperCase(), 9, this.bold, gold);
    this.gap(2);
  }

  private moneyLine(label: string, amount: string, detail = '', strong = false): void {
    const size = strong ? 11 : 10;
    const font = strong ? this.bold : this.regular;
    const safeAmount = pdfText(amount);
    const amountWidth = this.bold.widthOfTextAtSize(safeAmount, size);
    const labelWidth = contentWidth - amountWidth - 16;
    const parts = wrap(pdfText(label), font, size, labelWidth);
    const detailHeight = detail ? 12 : 0;
    this.need(parts.length * (size + 3) + detailHeight + 2);
    parts.forEach((part, index) => {
      this.page.drawText(part, { x: margin, y: this.y - size, size, font, color: ink });
      if (index === 0) {
        this.page.drawText(safeAmount, {
          x: margin + contentWidth - amountWidth,
          y: this.y - size,
          size,
          font: this.bold,
          color: ink,
        });
      }
      this.y -= size + 3;
    });
    if (detail) {
      this.page.drawText(pdfText(detail), { x: margin, y: this.y - 8, size: 8, font: this.regular, color: muted });
      this.y -= 12;
    }
  }

  private paragraph(text: string, size: number, color: RGB): void {
    this.line(text, size, this.regular, color);
    this.gap(2);
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ').filter((word) => word.length > 0);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const pieces = splitWord(word, font, size, maxWidth);
    for (const piece of pieces) {
      const next = current ? `${current} ${piece}` : piece;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
      else {
        if (current) lines.push(current);
        current = piece;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function splitWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const parts: string[] = [];
  let current = '';
  for (const char of word) {
    const next = current + char;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) parts.push(current);
      current = char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function pdfText(value: string): string {
  return value.replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?');
}
