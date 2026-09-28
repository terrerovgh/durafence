import { buildEstimatePdf, estimatePdfName } from '../../src/data/estimate-pdf.ts';
import { formatSentOn, prepareEstimateLetter } from '../../src/data/estimate-mail.ts';

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const raw = await request.text();
  if (raw.length > 20_000) return Response.json({ message: 'That request is too long.' }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ message: 'The estimate could not be read.' }, { status: 400 });
  }

  const prepared = prepareEstimateLetter(payload, formatSentOn(new Date()), false);
  if (!prepared.ok) {
    return Response.json({ message: prepared.message, fields: prepared.fields }, { status: prepared.status });
  }
  if (prepared.kind === 'honeypot') return Response.json({ message: 'The estimate could not be read.' }, { status: 400 });

  try {
    const pdf = await buildEstimatePdf(prepared.letter);
    return new Response(pdf, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${estimatePdfName}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'estimate_pdf_failed', message: error instanceof Error ? error.message : 'unknown' }));
    return Response.json({ message: 'The estimate PDF could not be built.' }, { status: 500 });
  }
}
