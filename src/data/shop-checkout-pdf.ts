import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { invoiceLogoPng } from './invoice-logo.ts';
import { shopOrderText, type ShopOrder } from './shop-checkout.ts';

/** Independent checkout document; the existing estimate PDF remains unchanged. */
export async function buildShopPdf(order: ShopOrder, reference: string, date: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(invoiceLogoPng);
  doc.setTitle('Dura Fence Metal — Estimated invoice');
  doc.setAuthor('Dura Fence Metal');
  let page = doc.addPage([612, 792]);
  const size = logo.scaleToFit(130, 70);
  page.drawImage(logo, { x: 40, y: 708, ...size });
  page.drawText('ESTIMATED INVOICE', { x: 250, y: 745, size: 18, font: bold, color: rgb(0.35, 0.23, 0.1) });
  let y = 690;
  const printable = (text: string) => [...text].map((char) => {
    try { font.encodeText(char); return char; } catch { return '?'; }
  }).join('');
  const draw = (text: string) => {
    if (y < 45) { page = doc.addPage([612, 792]); y = 744; }
    page.drawText(text, { x: 40, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
    y -= 16;
  };
  for (const source of shopOrderText(order, reference, date).split('\n')) {
    let line = '';
    for (const char of printable(source)) {
      if (font.widthOfTextAtSize(line + char, 11) > 532) {
        const space = line.lastIndexOf(' ');
        if (space > 0) { draw(line.slice(0, space)); line = line.slice(space + 1); }
        else { draw(line); line = ''; }
      }
      line += char;
    }
    draw(line);
  }
  return doc.save();
}
