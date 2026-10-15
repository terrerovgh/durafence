import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { appendTechnicalDrawing } from '../drawing/pdf-drawing.ts';
import { invoiceBay, invoiceSchedule } from '../drawing/order-drawing.ts';
import { invoiceLogoPng } from '../data/invoice-logo.ts';
import { site } from '../data/site.ts';
import { calculate, money, type StoredInvoice } from './model.ts';

export const PAPER = { width: 612, height: 792, margin: 40 };
const ink = rgb(0.067, 0.067, 0.067);
const gold = rgb(0.725, 0.522, 0.294);
const rule = rgb(0.72, 0.68, 0.62);
export const pdfText = (value: string) => value.replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?');

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let current = '';
    for (const char of pdfText(paragraph)) {
      if (font.widthOfTextAtSize(current + char, size) > width && current) {
        const at = current.lastIndexOf(' ');
        if (at > 0) { result.push(current.slice(0, at)); current = current.slice(at + 1) + char; }
        else { result.push(current); current = char; }
      } else current += char;
    }
    result.push(current);
  }
  return result;
}

export async function buildInvoicePdf(invoice: StoredInvoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(site.name + ' ' + invoice.number);
  doc.setAuthor(site.name); doc.setCreator(site.name);
  doc.setCreationDate(new Date(invoice.createdAt));
  doc.setModificationDate(new Date(invoice.updatedAt));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(Uint8Array.from(atob(invoiceLogoPng), (char) => char.charCodeAt(0)));
  const { width: pageWidth, height: pageHeight, margin } = PAPER;
  const contentWidth = pageWidth - 2 * margin;
  let page: PDFPage = doc.addPage([pageWidth, pageHeight]);
  let x = margin, width = contentWidth, y = 0;
  const text = (value: string, left: number, top: number, size = 9, strong = false) => {
    page.drawText(pdfText(value), { x: left, y: top, size, font: strong ? bold : regular, color: ink });
  };
  const line = (left: number, right: number, top: number, color = rule, thickness = 0.6) => {
    page.drawLine({ start: { x: left, y: top }, end: { x: right, y: top }, color, thickness });
  };
  const paragraph = (value: string, left: number, top: number, maxWidth: number, size = 8, pitch = 11) => {
    for (const part of wrap(value, regular, size, maxWidth)) { text(part, left, top, size); top -= pitch; }
    return top;
  };
  const ensure = (space: number) => {
    if (y - space >= 74) return;
    page = doc.addPage([pageWidth, pageHeight]); x = margin; width = contentWidth; y = pageHeight - margin - 18;
    text(site.name + ' / ' + invoice.number + ' / continued', x, y, 9, true);
    line(x, x + width, y - 10, gold); y -= 35;
  };
  const heading = (label: string) => {
    ensure(30); text(label.toUpperCase(), x, y, 9, true); line(x, x + width, y - 9, gold); y -= 24;
  };
  const row = (label: string, value: string, detail = '', strong = false) => {
    const valueWidth = bold.widthOfTextAtSize(pdfText(value), 8.5);
    const labels = wrap(label, strong ? bold : regular, 8.5, width - valueWidth - 12);
    const details = detail ? wrap(detail, regular, 7, width) : [];
    ensure(labels.length * 11 + details.length * 9 + 10);
    const top = y;
    for (const part of labels) { text(part, x, y, 8.5, strong); y -= 11; }
    text(value, x + width - valueWidth, top, 8.5, true);
    for (const part of details) { text(part, x, y, 7); y -= 9; }
    line(x, x + width, y - 3); y -= 10;
  };
  const note = (value: string) => {
    for (const part of wrap(value, regular, 8, width)) { ensure(13); text(part, x, y, 8); y -= 12; }
    y -= 4;
  };
  const result = calculate(invoice.order, invoice.payments);
  const top = pageHeight - margin;
  page.drawRectangle({ x: margin, y: top - 54, width: 54, height: 54, color: ink });
  page.drawImage(logo, { x: margin + 2, y: top - 51, width: 50, height: 46 });
  text('DURA FENCE METAL', margin + 66, top - 13, 13, true);
  text(site.region, margin + 66, top - 28, 8);
  text(site.tagline.toUpperCase(), margin + 66, top - 40, 7);
  text(site.phone + ' / durafencemetal.com', margin + 66, top - 53, 8, true);
  const title = invoice.kind === 'invoice' ? 'INVOICE' : 'ESTIMATE';
  text(title, pageWidth - margin - bold.widthOfTextAtSize(title, 17), top - 20, 17, true);
  text(invoice.number, pageWidth - margin - regular.widthOfTextAtSize(invoice.number, 9), top - 36, 9);
  text(invoice.updatedAt.slice(0, 10), pageWidth - margin - 70, top - 51, 8);
  line(margin, pageWidth - margin, top - 69, gold, 2);
  const customerTop = top - 95;
  text('BILL TO', margin, customerTop, 8, true); text('PROJECT LOCATION', 322, customerTop, 8, true);
  let left = customerTop - 16;
  for (const value of [invoice.order.customer.name || 'Not provided', invoice.order.customer.phone, invoice.order.customer.email]) {
    if (value) left = paragraph(value, margin, left, 250, 9, 11);
  }
  const right = paragraph(invoice.order.customer.address || 'Not provided', 322, customerTop - 16, 250, 9, 11);
  const start = Math.min(left, right) - 27;
  line(margin, pageWidth - margin, start + 13);
  y = start;
  heading('Order details');
  row('Package', invoice.order.packageId === 'standard' ? 'Standard' : 'Premium');
  row('Height', invoice.order.heightFt + ' ft'); row('Contracted run', result.grossFt + ' ft');
  row('Openings / solid fence', result.openingFt + ' / ' + result.netFt + ' ft'); row('Rate', money(result.rateCents) + ' / ft');
  heading('Items');
  for (const item of result.lines) row(item.description, item.included ? 'Included' : money(item.amountCents),
    item.quantity + ' ' + item.unit + (item.included ? '' : ' x ' + money(item.unitCents)));
  heading('Materials');
  const labels = { posts: 'Posts, total', reinforcedPosts: 'Reinforced posts, within total', railFeet: 'Fence rails, linear ft', fencePlanks: 'Fence planks', gatePlanks: 'Gate planks', screws: 'Screws' };
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) row(labels[key], String(result.materials[key]));
  row('Cameras', String(invoice.order.cameras.included + invoice.order.cameras.extra));
  note('Fence rails exclude gate openings. Gate frames and fittings are supplied as gate components.');
  for (const gate of invoice.order.gates) note((gate.kind === 'plank' ? 'Plank gate' : 'Custom aluminium gate') + ': ' + gate.widthFt + ' x ' + gate.heightFt + ' ft; ' + (gate.runId ? 'within fence run' : 'standalone') + '.');
  heading('Totals'); row('Subtotal', money(result.subtotalCents));
  if (result.discountCents) row('Discount', money(-result.discountCents));
  if (result.chargeCents) row(invoice.order.charge.label, money(result.chargeCents), invoice.order.charge.percent + ' percent');
  row('Total', money(result.totalCents), '', true); row('Agreed deposit', money(result.depositCents));
  row('Payments received', money(result.paidCents)); row('Balance', money(result.balanceCents), '', true);
  if (invoice.payments.length) {
    heading('Payments');
    for (const payment of invoice.payments) row(payment.date + ' / ' + payment.method, money(payment.amountCents), payment.note);
  }
  if (invoice.order.terms) { heading('Terms'); note(invoice.order.terms); }
  appendTechnicalDrawing(doc, regular, bold, invoiceBay(invoice.order, result), invoiceSchedule(invoice.order, result));
  const pages = doc.getPages();
  pages.forEach((current, index) => {
    page = current; line(margin, pageWidth - margin, 59, gold); text(site.name + ' / ' + site.region, margin, 45, 7);
    const footer = 'Rev ' + invoice.version + ' / Page ' + (index + 1) + ' of ' + pages.length;
    text(footer, pageWidth - margin - regular.widthOfTextAtSize(footer, 7), 45, 7);
  });
  return doc.save();
}

