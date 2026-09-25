import { onRequestPost } from '../functions/api/quote';

const CANONICAL_HOST = 'durafencemetal.com';

interface Env {
  ASSETS: Fetcher;
  RESEND_API_KEY?: string;
  QUOTE_TO?: string;
  QUOTE_FROM?: string;
}

function needsTrailingSlash(pathname: string): boolean {
  if (pathname === '/' || pathname.endsWith('/')) return false;
  if (pathname === '/api' || pathname.startsWith('/api/')) return false;
  const leaf = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !leaf.includes('.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    let redirect = false;

    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      url.protocol = 'https:';
      redirect = true;
    }

    if ((method === 'GET' || method === 'HEAD') && needsTrailingSlash(url.pathname)) {
      url.pathname = `${url.pathname}/`;
      redirect = true;
    }

    if (redirect) return Response.redirect(url.toString(), 301);

    if (url.pathname === '/api/quote' && method === 'POST') {
      return onRequestPost({ request, env });
    }

    const response = await env.ASSETS.fetch(request);
    if (url.hostname === CANONICAL_HOST) return response;

    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
