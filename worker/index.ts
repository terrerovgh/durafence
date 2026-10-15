import { handleInvoiceArea, isInvoiceArea, type InvoiceEnv } from './invoice-api.ts';
import { estimateCopies, onRequestPost as onEstimateEmail } from '../functions/api/estimate-email.ts';
import { onRequestGet as onEstimateAddress } from '../functions/api/estimate-address.ts';
import { onRequestPost } from '../functions/api/quote.ts';
import { invoiceAddress } from '../src/data/estimate-mail.ts';
import { contactAddress, contactInboxes } from '../src/data/site.ts';
import { onRequestPost as onShopCheckout } from '../functions/api/shop-checkout.ts';

const CANONICAL_HOST = 'durafencemetal.com';

interface Env extends InvoiceEnv {
  ASSETS: Fetcher;
  RESEND_API_KEY?: string;
  RESENT_API_KEY?: string;
}

type ForwardableMail = {
  to: string;
  forward(rcptTo: string): Promise<void>;
  setReject(reason: string): void;
};

function sameAddress(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function needsTrailingSlash(pathname: string): boolean {
  if (pathname === '/' || pathname.endsWith('/')) return false;
  if (pathname === '/api' || pathname.startsWith('/api/')) return false;
  const leaf = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !leaf.includes('.');
}

export default {
  async email(message: ForwardableMail): Promise<void> {
    if (sameAddress(message.to, contactAddress)) {
      let delivered = 0;
      for (const inbox of contactInboxes) {
        try {
          await message.forward(inbox);
          delivered += 1;
        } catch (error) {
          console.error(JSON.stringify({
            event: 'contact_forward_failed',
            message: error instanceof Error ? error.message : 'unknown',
          }));
        }
      }
      if (delivered === 0) message.setReject('Mailbox is not ready.');
      return;
    }
    if (!sameAddress(message.to, invoiceAddress)) {
      message.setReject('This address does not accept mail.');
      return;
    }
    let delivered = 0;
    for (const copy of estimateCopies) {
      try {
        await message.forward(copy);
        delivered += 1;
      } catch (error) {
        console.error(JSON.stringify({
          event: 'invoice_forward_failed',
          message: error instanceof Error ? error.message : 'unknown',
        }));
      }
    }
    if (delivered === 0) message.setReject('Mailbox is not ready.');
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (isInvoiceArea(url.pathname)) return handleInvoiceArea(request, env);
    const method = request.method;
    let redirect = false;

    if (url.hostname === CANONICAL_HOST && url.protocol !== 'https:' && (url.pathname === '/shop-checkout' || url.pathname === '/shop-checkout/' || url.pathname === '/api/shop-checkout')) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 308);
    }

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

    if (url.pathname === '/shop-checkout/' && method === 'GET') {
      console.log(JSON.stringify({ event: 'shop_checkout_arrival', query: url.search }));
    }
    if (url.pathname === '/api/shop-checkout') {
      if (method === 'POST') return onShopCheckout({ request, env });
      return new Response('Method not allowed', { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/api/quote' && method === 'POST') {
      return onRequestPost({ request, env });
    }

    if (url.pathname === '/api/estimate-email' && method === 'POST') {
      return onEstimateEmail({ request, env });
    }

    if (url.pathname === '/api/estimate-address' && method === 'GET') {
      return onEstimateAddress({ request });
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

