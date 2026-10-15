export const PDF_OVERFLOW_EN = 'This document does not fit readably on one Letter page. Shorten the descriptions, terms, customer details or payment notes, or adjust the document before printing or sending. No information was removed.';
export const PDF_OVERFLOW_ES = 'El documento no cabe de forma legible en una sola pagina Letter. Acorta las descripciones, condiciones, datos del cliente o notas de pagos, o ajusta el documento antes de imprimir o enviar. No se elimino informacion. Puedes guardar y editar el borrador.';
export class PdfLayoutOverflowError extends Error {
  readonly code = 'PDF_LAYOUT_OVERFLOW';
  constructor() { super(PDF_OVERFLOW_EN); this.name = 'PdfLayoutOverflowError'; }
}
