import { rgb, type PDFDocument, type PDFPage, type PDFFont } from 'pdf-lib';
import { fenceScene, type BayDrawing, type FenceScene } from './fence-scene.ts';

const safeText = (value: string) => value.replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?');
const color = (hex: string) => rgb(...[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number]);

/** At 1 scene unit per point, all detail text remains at least 9 pt on Letter. */
export function renderFenceScene(page: PDFPage, regular: PDFFont, bold: PDFFont, scene: FenceScene): void {
  const left = 40, top = 752;
  for (const item of scene.primitives) {
    if (item.kind === 'text') {
      const font = item.strong ? bold : regular;
      const value = safeText(item.text);
      if (font.widthOfTextAtSize(value, item.size) > item.maxWidth) throw new RangeError('Drawing label exceeds its layout box');
      const offset = item.align === 'start' ? 0 : font.widthOfTextAtSize(value, item.size) / (item.align === 'middle' ? 2 : 1);
      page.drawText(value, { x: left + item.x - offset, y: top - item.y, size: item.size, font, color: color('#222222') });
    } else if (item.kind === 'line') {
      page.drawLine({ start: { x: left + item.x1, y: top - item.y1 }, end: { x: left + item.x2, y: top - item.y2 },
        thickness: item.weight, color: color(item.color) });
    } else if (item.kind === 'rect') {
      page.drawRectangle({ x: left + item.x, y: top - item.y - item.height,
        width: item.width, height: item.height, color: color(item.fill), borderColor: color(item.stroke), borderWidth: 0.6 });
    } else {
      const path = item.points.map((point, i) => (i ? 'L ' : 'M ') + point.x + ' ' + point.y).join(' ') + ' Z';
      page.drawSvgPath(path, { x: left, y: top, color: color(item.fill), borderColor: color(item.stroke), borderWidth: 0.6 });
    }
  }
}

/** Append only; financial pages, customer information and their ordering are retained. */
export function appendTechnicalDrawing(doc: PDFDocument, regular: PDFFont, bold: PDFFont, spec: BayDrawing, schedule: string[]): void {
  let page = doc.addPage([612, 792]);
  const scene = fenceScene(spec);
  renderFenceScene(page, regular, bold, scene);
  let y = 752 - scene.height - 22;
  const heading = () => {
    page.drawText('DIMENSION SCHEDULE / ORDER REFERENCE', { x: 40, y, size: 10, font: bold, color: color('#222222') });
    y -= 22;
  };
  heading();
  for (const row of schedule) {
    for (const part of drawingLines(row, regular, 9, 532)) {
      if (y < 86) {
        page = doc.addPage([612, 792]); y = 736;
        heading();
      }
      page.drawText(part, { x: 40, y, size: 9, font: regular, color: color('#222222') });
      y -= 13;
    }
    y -= 6;
  }
}

export function drawingLines(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safeText(value).split(/\r?\n/)) {
    let current = '';
    for (const char of paragraph) {
      if (font.widthOfTextAtSize(current + char, size) > width && current) {
        const space = current.lastIndexOf(' ');
        if (space > 0) { lines.push(current.slice(0, space)); current = current.slice(space + 1) + char; }
        else { lines.push(current); current = char; }
      } else current += char;
    }
    lines.push(current);
  }
  return lines;
}
