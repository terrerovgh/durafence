/** The PDF shared by Print / Save PDF and Email PDF. */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { formatFeetInches, formatReceiptMoney } from './estimate.ts';
import { letterTotals, type EstimateLetter } from './estimate-mail.ts';
import { appendTechnicalDrawing } from '../drawing/pdf-drawing.ts';
import { estimateBay, estimateSchedule } from '../drawing/order-drawing.ts';
import { invoiceLogoPng } from './invoice-logo.ts';
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
  const logo = await doc.embedPng(Uint8Array.from(atob(invoiceLogoPng), (char) => char.charCodeAt(0)));
  const sheet = new Sheet(doc, regular, bold, logo);
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
  private x = margin;
  private width = contentWidth;
  private doc: PDFDocument;
  private regular: PDFFont;
  private bold: PDFFont;
  private logo: Awaited<ReturnType<PDFDocument['embedPng']>>;

  constructor(
    doc: PDFDocument,
    regular: PDFFont,
    bold: PDFFont,
    logo: Awaited<ReturnType<PDFDocument['embedPng']>>,
  ) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.logo = logo;
    this.page = doc.addPage([pageWidth, pageHeight]);
  }

  draw(letter: EstimateLetter): void {
    this.header(letter);
    this.customer(letter);
    this.x = margin;
    this.width = contentWidth;
    this.heading('Order details');
    this.spec('Package', letter.result.packageName);
    this.spec('Labor', letter.result.laborName);
    this.spec('Height', formatFeetInches(letter.heightFt));
    this.spec('Run', letter.result.runLabel ? `${letter.result.runLabel} ft` : 'No fence run');
    this.spec('Rate', `${formatReceiptMoney(letter.result.ratePerFoot * 100)} / ft`);
    this.spec('Payment', letter.payByCard ? 'Card' : 'Cash');
    this.y -= 7;

    for (const group of letter.result.groups) {
      this.group(group.label);
      for (const line of group.lines) this.row(line.label, formatReceiptMoney(line.amountCents), line.detail);
      for (const note of group.notes) this.row(note.label, note.value, note.detail);
      this.row(`${group.label} subtotal`, formatReceiptMoney(group.subtotalCents), '', true);
    }

    const totals = letterTotals(letter);
    this.y -= 6;
    this.rule(this.x, this.x + this.width, this.y, ink, 1.6);
    this.y -= 9;
    this.row('Subtotal', formatReceiptMoney(letter.result.totalCents), '', true);
    if (letter.discount.appliedCents > 0) {
      const off = letter.discount.kind === 'percent'
        ? `${letter.discount.percent}% off`
        : `${formatReceiptMoney(letter.discount.requestedCents)} off`;
      this.row('Discount', formatReceiptMoney(-letter.discount.appliedCents), off);
    }
    this.row('Tax', formatReceiptMoney(totals.tax), letter.payByCard ? 'Card, 7%' : 'Cash');
    this.emphasis('Total', formatReceiptMoney(totals.due), ink, rgb(1, 1, 1));
    this.emphasis('Due with request', formatReceiptMoney(totals.deposit), rgb(0.95, 0.94, 0.91), ink);
    this.small('Card adds 7% tax. Cash does not.');
    if (letter.result.hasFence) {
      this.small('Corners and gate openings can change the post count. The price follows the footage.');
    }
    appendTechnicalDrawing(this.doc, this.regular, this.bold, estimateBay(letter.result, letter.heightFt), estimateSchedule(letter.result));
    this.footer();
  }

  private header(letter: EstimateLetter): void {
    const top = pageHeight - margin;
    this.page.drawRectangle({ x: margin, y: top - 54, width: 54, height: 54, color: ink });
    this.page.drawImage(this.logo, { x: margin + 2, y: top - 51, width: 50, height: 46 });
    this.label('DURA FENCE METAL', margin + 67, top - 13, 13, this.bold, ink);
    this.label(site.region, margin + 67, top - 28, 8, this.regular, muted);
    this.label(site.tagline.toUpperCase(), margin + 67, top - 40, 7.5, this.regular, muted);
    this.label(`${site.phone}  /  durafencemetal.com`, margin + 67, top - 52, 8, this.bold, ink);
    this.right('INVOICE', pageWidth - margin, top - 22, 17, this.bold, ink);
    this.rule(margin, pageWidth - margin, top - 69, gold, 2);
    this.label(pdfText(letter.sentOn), pageWidth - margin - 105, top - 47, 8, this.regular, muted);
  }

  private customer(letter: EstimateLetter): void {
    const top = 660;
    this.label('BILL TO', margin, top, 8, this.bold, gold);
    this.label('PROJECT LOCATION', 322, top, 8, this.bold, gold);
    let leftY = top - 15;
    for (const value of [letter.customer.name || 'Not provided', letter.customer.phone, letter.customer.email]) {
      if (value) leftY = this.text(value, margin, leftY, 9, this.regular, ink, 250, 11);
    }
    const rightY = this.text(letter.customer.address || 'Not provided', 322, top - 15, 9, this.regular, ink, 250, 11);
    this.y = Math.min(leftY, rightY) - 27;
    this.rule(margin, pageWidth - margin, this.y + 13, rule, 0.6);
  }

  private heading(title: string): void {
    this.ensure(20);
    this.label(title.toUpperCase(), this.x, this.y, 9, this.bold, ink);
    this.rule(this.x, this.x + this.width, this.y - 9, gold, 0.8);
    this.y -= 22;
  }

  private spec(label: string, value: string): void {
    this.ensure(12);
    this.label(label, this.x, this.y, 7.7, this.regular, muted);
    this.right(value, this.x + this.width, this.y, 7.7, this.bold, ink);
    this.y -= 13;
  }

  private group(label: string): void {
    this.ensure(22);
    this.page.drawRectangle({ x: this.x, y: this.y - 13, width: this.width, height: 16, color: rgb(0.95, 0.94, 0.91) });
    this.label(label.toUpperCase(), this.x + 7, this.y - 8, 8, this.bold, ink);
    this.y -= 18;
  }

  private row(label: string, value: string, detail = '', strong = false): void {
    const amountWidth = this.bold.widthOfTextAtSize(pdfText(value), 8.2);
    const labelWidth = Math.max(40, this.width - amountWidth - 9);
    const lines = wrap(pdfText(label), strong ? this.bold : this.regular, 8.2, labelWidth);
    const detailLines = detail ? wrap(pdfText(detail), this.regular, 6.8, this.width) : [];
    const height = lines.length * 10 + detailLines.length * 8 + 13;
    this.ensure(height);
    const rowTop = this.y;
    for (const part of lines) {
      this.label(part, this.x, this.y, 8.2, strong ? this.bold : this.regular, ink);
      this.y -= 10;
    }
    this.right(value, this.x + this.width, rowTop, 8.2, this.bold, ink);
    if (detail) {
      this.y = this.text(detail, this.x, this.y, 6.8, this.regular, muted, this.width, 8);
    }
    this.y -= 3;
    this.rule(this.x, this.x + this.width, this.y - 2, rule, 0.3);
    this.y -= 10;
  }

  private emphasis(label: string, value: string, background: RGB, foreground: RGB): void {
    this.ensure(25);
    this.page.drawRectangle({ x: this.x, y: this.y - 14, width: this.width, height: 19, color: background });
    this.label(label, this.x + 6, this.y - 8, 10, this.bold, foreground);
    this.right(value, this.x + this.width - 6, this.y - 8, 10, this.bold, foreground);
    this.y -= 24;
  }

  private small(value: string): void {
    const lines = wrap(pdfText(value), this.regular, 7, this.width);
    this.ensure(lines.length * 9 + 4);
    this.y = this.text(value, this.x, this.y, 7, this.regular, muted, this.width, 9) - 3;
  }

  private footer(): void {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      this.page = page;
      this.rule(margin, pageWidth - margin, 59, gold, 0.7);
      this.label(site.name + ' / ' + site.region, margin, 45, 7, this.regular, muted);
      this.label('Thank you for choosing Dura Fence Metal.', 265, 45, 7, this.regular, muted);
      this.right('Page ' + (index + 1) + ' of ' + pages.length, pageWidth - margin, 45, 7, this.regular, muted);
    });
  }

  private ensure(height: number): void {
    if (this.y - height > 65) return;
    this.page = this.doc.addPage([pageWidth, pageHeight]);
    this.x = margin;
    this.width = contentWidth;
    this.y = pageHeight - 50;
    this.label('Dura Fence Metal / invoice continued', margin, this.y, 9, this.regular, muted);
    this.y -= 25;
  }

  private rule(x1: number, x2: number, y: number, color: RGB, thickness: number): void {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }

  private label(value: string, x: number, y: number, size: number, font: PDFFont, color: RGB): void {
    this.page.drawText(pdfText(value), { x, y, size, font, color });
  }

  private right(value: string, x: number, y: number, size: number, font: PDFFont, color: RGB): void {
    const safe = pdfText(value);
    this.label(safe, x - font.widthOfTextAtSize(safe, size), y, size, font, color);
  }

  private text(value: string, x: number, y: number, size: number, font: PDFFont, color: RGB, width: number, lineHeight: number): number {
    for (const line of wrap(pdfText(value), font, size, width)) {
      this.label(line, x, y, size, font, color);
      y -= lineHeight;
    }
    return y;
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
