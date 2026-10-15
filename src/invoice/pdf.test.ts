import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { newOrder, type StoredInvoice } from './model.ts';
import { buildInvoicePdf, PAPER } from './pdf.ts';
import { PdfLayoutOverflowError } from '../pdf/layout-error.ts';

function invoice(): StoredInvoice {
  const order = newOrder(); order.heightFt = 8;
  order.customer = { name:'Synthetic customer',email:'customer@example.test',phone:'5550100',address:'Synthetic project location' };
  order.runs = [{ id:'front',name:'front',lengthFt:200,startNode:'A',endNode:'B' }];
  return { id:'test',seq:1,version:1,kind:'invoice',number:'DFM-2026-000001',
    createdAt:'2026-10-14T12:00:00Z',updatedAt:'2026-10-14T12:00:00Z',actor:'seller@example.test',order,payments:[] };
}
test('Letter PDF contains the custom drawing and order on exactly one page with 40pt margins', async () => {
  const bytes = await buildInvoicePdf(invoice()), pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),1); assert.equal(PAPER.margin,40);
  assert.deepEqual(pdf.getPage(0).getSize(),{ width:612,height:792 });
  assert.equal(pdf.getTitle(),'Dura Fence Metal DFM-2026-000001');
  assert.ok(bytes.length > 1000);
});
test('oversized items and terms fail instead of creating continuation pages', async () => {
  const document = invoice();
  document.order.items = Array.from({ length:40 },(_,index) => ({
    id:String(index),description:'Additional negotiated service ' + index,quantity:1,unit:'unit',unitCents:100,included:false,
  }));
  document.order.terms = 'A long agreement. '.repeat(150);
  await assert.rejects(() => buildInvoicePdf(document), PdfLayoutOverflowError);
});
