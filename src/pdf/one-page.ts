import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { invoiceLogoPng } from '../data/invoice-logo.ts';
import { site } from '../data/site.ts';
import { compactFenceScene } from '../drawing/compact-scene.ts';
import type { BayDrawing, Primitive } from '../drawing/fence-scene.ts';
import { PdfLayoutOverflowError } from './layout-error.ts';
export { PdfLayoutOverflowError } from './layout-error.ts';

export const LETTER = { width: 612, height: 792, margin: 40 };
export const packingProfiles = [
  { name: 'comfortable', size: 9, gap: 3.5 },
  { name: 'compact', size: 8.5, gap: 2.5 },
  { name: 'dense', size: 7.5, gap: 2 },
] as const;
export type PdfBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'row'; label: string; value: string; detail?: string; strong?: boolean };
export type OnePageInput = {
  title: 'ESTIMATE' | 'INVOICE'; reference: string; date: string; revision?: number;
  customer: { name: string; email: string; phone: string; address: string };
  spec: BayDrawing; left: PdfBlock[]; right: PdfBlock[]; bottom: PdfBlock[];
  metadataTitle: string; createdAt?: string; updatedAt?: string;
};
export type TextPlacement = {
  kind: 'text'; text: string; x: number; y: number; size: number; strong: boolean;
  width: number; height: number; role: string;
};
type Graphic = Exclude<Primitive, { kind: 'text' }>;
export type PagePlan = {
  profile: string; texts: TextPlacement[]; graphics: Graphic[];
  logo: { x: number; y: number; width: number; height: number };
  contentBottom: number;
};
type Fonts = { regular: PDFFont; bold: PDFFont };
const ink = '#222222', gold = '#b9854b';
export const safePdfText = (value: string): string => value.replace(/[^\u0020-\u007E\u00A0-\u00FF\r\n]/g, '?');

/** Character fallback preserves every safe character, including long unbroken tokens. */
export function wrapPdfText(value: string, font: PDFFont, size: number, width: number): string[] {
  if (!(width > 0)) throw new PdfLayoutOverflowError();
  const output: string[] = [];
  for (const paragraph of safePdfText(value).split(/\r?\n/)) {
    let current = '';
    for (const char of paragraph) {
      if (font.widthOfTextAtSize(char, size) > width) throw new PdfLayoutOverflowError();
      if (font.widthOfTextAtSize(current + char, size) > width && current) {
        const at = current.lastIndexOf(' ');
        if (at > 0 && font.widthOfTextAtSize(current.slice(at + 1) + char, size) <= width) { output.push(current.slice(0, at)); current = current.slice(at + 1) + char; }
        else { output.push(current); current = char; }
      } else current += char;
    }
    output.push(current);
  }
  return output;
}

/** Pure preflight: measured glyph widths and conservative line boxes; never adds a page. */
export function measureOnePage(input: OnePageInput, fonts: Fonts): PagePlan {
  for (const profile of packingProfiles) {
    try { return measureProfile(input, fonts, profile); }
    catch (error) { if (!(error instanceof PdfLayoutOverflowError)) throw error; }
  }
  throw new PdfLayoutOverflowError();
}

function measureProfile(input: OnePageInput, fonts: Fonts, profile: typeof packingProfiles[number]): PagePlan {
  const plan: PagePlan = { profile: profile.name, texts: [], graphics: [],
    logo: { x: 40, y: 40, width: 34, height: 34 }, contentBottom: 0 };
  const lineHeight = (size: number) => Math.max(size * 1.3, fonts.regular.heightAtSize(size) + 2);
  const place = (text: string, x: number, top: number, width: number, size: number, strong = false,
    role = 'body', align: 'start' | 'end' | 'middle' = 'start', limit = 716) => {
    const value = safePdfText(text), font = strong ? fonts.bold : fonts.regular;
    const measured = font.widthOfTextAtSize(value, size), height = lineHeight(size);
    const left = align === 'start' ? x : align === 'end' ? x + width - measured : x + (width - measured) / 2;
    if (size < 7.5 || measured > width + 0.001 || left < 40 || left + measured > 572.001 || top < 40 || top + height > limit) throw new PdfLayoutOverflowError();
    plan.texts.push({ kind: 'text', text: value, x: left, y: top, size, strong, width: measured, height, role });
  };
  const paragraph = (value: string, x: number, top: number, width: number, size: number = profile.size,
    strong = false, role = 'body', align: 'start' | 'end' = 'start') => {
    for (const part of wrapPdfText(value, strong ? fonts.bold : fonts.regular, size, width)) {
      place(part, x, top, width, size, strong, role, align);
      top += lineHeight(size);
    }
    return top;
  };
  const rule = (x1: number, x2: number, y: number, color = gold, weight = 0.65) =>
    plan.graphics.push({ kind: 'line', role: 'rule', x1, x2, y1: y, y2: y, color, weight });
  const blocks = (items: PdfBlock[], x: number, top: number, width: number, role: string): number => {
    for (const item of items) {
      if (item.kind === 'heading') {
        top += profile.gap;
        top = paragraph(item.text.toUpperCase(), x, top, width, profile.size + 0.5, true, role);
        rule(x, x + width, top + 1); top += profile.gap + 3;
      } else if (item.kind === 'text') {
        top = paragraph(item.text, x, top, width, profile.size, false, role) + profile.gap;
      } else {
        const value = safePdfText(item.value);
        const valueWidth = Math.min(width * 0.43, Math.max(30, fonts.bold.widthOfTextAtSize(value, profile.size)));
        const labels = wrapPdfText(item.label, item.strong ? fonts.bold : fonts.regular, profile.size, width - valueWidth - 8);
        const values = wrapPdfText(value, fonts.bold, profile.size, valueWidth);
        labels.forEach((part, i) => place(part, x, top + i * lineHeight(profile.size), width - valueWidth - 8, profile.size, Boolean(item.strong), role));
        values.forEach((part, i) => place(part, x + width - valueWidth, top + i * lineHeight(profile.size), valueWidth, profile.size, true, role, 'end'));
        top += Math.max(labels.length, values.length) * lineHeight(profile.size);
        if (item.detail) top = paragraph(item.detail, x, top, width, profile.size, false, role);
        top += profile.gap;
      }
      if (top > 716) throw new PdfLayoutOverflowError();
    }
    return top;
  };
  place('DURA FENCE METAL', 84, 40, 285, 12, true, 'brand');
  paragraph(site.phone + '  /  durafencemetal.com', 84, 57, 285, 8, false, 'brand');
  const brandBottom = paragraph(site.region + '  /  ' + site.tagline, 40, 82, 532, 7.5, false, 'brand');
  let rightTop = paragraph(input.title, 384, 40, 188, 16, true, 'reference', 'end');
  if (input.reference) rightTop = paragraph(input.reference, 384, rightTop, 188, 8.5, false, 'reference', 'end');
  rightTop = paragraph(input.date + (input.revision === undefined ? '' : ' / Rev ' + input.revision), 384, rightTop, 188, 8.5, false, 'reference', 'end');
  const customerTop = Math.max(108, rightTop + 8, brandBottom + 8);
  rule(40, 572, customerTop - 6, gold, 1.2);
  let a = paragraph('CUSTOMER', 40, customerTop, 248, 8.5, true, 'customer');
  let b = paragraph('PROJECT LOCATION', 304, customerTop, 268, 8.5, true, 'customer');
  for (const value of [input.customer.name || 'Not provided', input.customer.phone, input.customer.email]) {
    if (value) a = paragraph(value, 40, a, 248, profile.size, false, 'customer');
  }
  b = paragraph(input.customer.address || 'Not provided', 304, b, 268, profile.size, false, 'customer');
  const mainTop = Math.max(a, b) + 10;
  const scene = compactFenceScene(input.spec);
  for (const item of scene.primitives) {
    if (item.kind === 'text') {
      const width = item.maxWidth;
      const x = item.align === 'start' ? item.x : item.align === 'end' ? item.x - width : item.x - width / 2;
      place(item.text, 40 + x, mainTop + item.y - item.size, width, item.size, item.strong, 'drawing', item.align);
    } else if (item.kind === 'line') plan.graphics.push({ ...item, x1: 40 + item.x1, x2: 40 + item.x2, y1: mainTop + item.y1, y2: mainTop + item.y2 });
    else if (item.kind === 'rect') plan.graphics.push({ ...item, x: 40 + item.x, y: mainTop + item.y });
    else plan.graphics.push({ ...item, points: item.points.map((point) => ({ x: 40 + point.x, y: mainTop + point.y })) });
  }
  const leftBottom = blocks(input.left, 40, mainTop + scene.height + 4, 248, 'left');
  const rightBottom = blocks(input.right, 304, mainTop, 268, 'right');
  plan.contentBottom = blocks(input.bottom, 40, Math.max(leftBottom, rightBottom) + 6, 532, 'bottom');
  if (plan.contentBottom > 716) throw new PdfLayoutOverflowError();
  // The footer is part of the measured plan, not content added after acceptance.
  rule(40, 572, 724);
  place(site.name + ' / ' + site.region, 40, 730, 300, 7.5, false, 'footer', 'start', 752);
  place('Page 1 of 1', 412, 730, 160, 7.5, false, 'footer', 'end', 752);
  place('Thank you for choosing Dura Fence Metal.', 40, 742, 532, 7.5, false, 'footer', 'middle', 752);
  return plan;
}
const color = (hex: string) => rgb(...[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number]);

export async function renderOnePage(input: OnePageInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const plan = measureOnePage(input, { regular, bold });
  // Overflow has already failed before this sole addPage, logo drawing or save.
  const logo = await doc.embedPng(Uint8Array.from(atob(invoiceLogoPng), (char) => char.charCodeAt(0)));
  doc.setTitle(input.metadataTitle); doc.setAuthor(site.name); doc.setCreator(site.name);
  if (input.createdAt) doc.setCreationDate(new Date(input.createdAt));
  if (input.updatedAt) doc.setModificationDate(new Date(input.updatedAt));
  const page = doc.addPage([LETTER.width, LETTER.height]);
  page.drawRectangle({ x: plan.logo.x, y: 792 - plan.logo.y - plan.logo.height, width: plan.logo.width, height: plan.logo.height, color: color(ink) });
  page.drawImage(logo, { x: plan.logo.x + 1, y: 792 - plan.logo.y - plan.logo.height + 2, width: 32, height: 30 });
  for (const item of plan.graphics) {
    if (item.kind === 'line') page.drawLine({ start: { x: item.x1, y: 792 - item.y1 }, end: { x: item.x2, y: 792 - item.y2 }, thickness: item.weight, color: color(item.color) });
    else if (item.kind === 'rect') page.drawRectangle({ x: item.x, y: 792 - item.y - item.height, width: item.width, height: item.height, color: color(item.fill), borderColor: color(item.stroke), borderWidth: 0.4 });
    else page.drawSvgPath(item.points.map((point, i) => (i ? 'L ' : 'M ') + point.x + ' ' + point.y).join(' ') + ' Z', { x: 0, y: 792, color: color(item.fill), borderColor: color(item.stroke), borderWidth: 0.4 });
  }
  for (const item of plan.texts) {
    page.drawText(item.text, { x: item.x, y: 792 - item.y - item.size, size: item.size, font: item.strong ? bold : regular, color: color(ink) });
  }
  return doc.save();
}
