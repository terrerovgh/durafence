// Cloudflare Pages: one canonical host and one trailing-slash form.
// Matches the absolute URLs emitted from astro.config.mjs `site`.

const CANONICAL_HOST = 'durafencemetal.com';

function needsTrailingSlash(pathname: string): boolean {
  if (pathname === '/' || pathname.endsWith('/')) return false;
  if (pathname === '/api' || pathname.startsWith('/api/')) return false;
  const leaf = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !leaf.includes('.');
}

interface MiddlewareContext {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(context: MiddlewareContext): Promise<Response> {
  const url = new URL(context.request.url);
  const method = context.request.method;
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
  return context.next();
}
