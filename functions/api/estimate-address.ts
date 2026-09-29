import { addressSuggestions, validateUsAddress } from '../../src/data/us-address.ts';

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const params = new URL(context.request.url).searchParams;
  if (params.has('address')) {
    const address = params.get('address')?.trim() ?? '';
    const result = await validateUsAddress(address);
    if (result.kind === 'unavailable') {
      return Response.json({ valid: false, message: 'Address verification is temporarily unavailable.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    return Response.json({ valid: result.kind === 'valid' }, { headers: { 'cache-control': 'no-store' } });
  }
  const query = params.get('q')?.trim() ?? '';
  if (query.length < 4 || query.length > 200) {
    return Response.json({ suggestions: [] }, { headers: { 'cache-control': 'no-store' } });
  }
  try {
    const suggestions = await addressSuggestions(query);
    return Response.json({ suggestions }, { headers: { 'cache-control': 'private, max-age=60' } });
  } catch {
    return Response.json({ suggestions: [], message: 'Address suggestions are temporarily unavailable.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
