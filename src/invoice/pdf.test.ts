import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { newOrder, type StoredInvoice } from './model.ts';
import { buildInvoicePdf, PAPER } from './pdf.ts';

test('Letter PDFs keep margins, custom dimensions and readable continuation pages',async () => {
  const order=newOrder(); order.heightFt=8;
  order.customer={name:'Synthetic customer',email:'customer@example.test',phone:'5550100',address:'Synthetic project location'};
  order.runs=[{id:'front',name:'front',lengthFt:200,startNode:'A',endNode:'B'}];
  order.items=Array.from({length:40},(_,index) => ({id:String(index),description:'Additional negotiated service '+index,quantity:1,unit:'unit',unitCents:100,included:false}));
  order.terms='A long agreement. '.repeat(150);
  const invoice:StoredInvoice={id:'test',seq:1,version:1,kind:'invoice',number:'DFM-2026-000001',
    createdAt:'2026-10-14T12:00:00Z',updatedAt:'2026-10-14T12:00:00Z',actor:'seller@example.test',order,payments:[]};
  const bytes=await buildInvoicePdf(invoice), pdf=await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount()>1); assert.equal(PAPER.margin,40);
  for(const page of pdf.getPages()) assert.deepEqual(page.getSize(),{width:612,height:792});
  assert.equal(pdf.getTitle(),'Dura Fence Metal DFM-2026-000001');
  assert.ok(bytes.length>1000);
});

