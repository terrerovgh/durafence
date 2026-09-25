// Cloudflare Pages Function — POST /api/quote
// Sends the quote text with Resend when RESEND_API_KEY, QUOTE_TO, and QUOTE_FROM are set.
// QUOTE_FROM must be a sender on a domain Resend has verified.

interface Env {
  RESEND_API_KEY?: string;
  QUOTE_TO?: string;
  QUOTE_FROM?: string;
}

const propertyLabels: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
};

const workLabels: Record<string, string> = {
  new: 'New fence',
  replace: 'Replacement',
  gate: 'Gate only',
  repair: 'Repair or custom piece',
};

const lengthLabels: Record<string, string> = {
  'under-100': 'Under 100 ft',
  '100-300': '100–300 ft',
  'over-300': 'More than 300 ft',
  unknown: "I don't know yet",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function html(title: string, body: string, status: number): Response {
  const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;background:#090909;color:#d5d6d8;font:18px/1.5 Arial,sans-serif}main{max-width:38rem;margin:0 auto;padding:4rem 1.25rem}a{color:#d9ac66}pre{white-space:pre-wrap;color:#b9bbbf}</style>
</head><body><main><h1>${escapeHtml(title)}</h1>${body}<p><a href="/quote">Back to the form</a></p></main></body></html>`;
  return new Response(document, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function wantsJson(request: Request): boolean {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return true;
  return (request.headers.get('accept') ?? '').includes('application/json');
}

async function readPayload(request: Request): Promise<Record<string, string> | null> {
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const data: unknown = await request.json();
      if (!data || typeof data !== 'object') return {};
      const payload: Record<string, string> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (typeof value === 'string') payload[key] = value;
      }
      return payload;
    }
    const form = await request.formData();
    const payload: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') payload[key] = value;
    }
    return payload;
  } catch {
    return null;
  }
}

function validate(input: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = (input.name ?? '').trim();
  const phone = (input.phone ?? '').trim();
  const email = (input.email ?? '').trim();
  const city = (input.city ?? '').trim();
  const property = (input.property ?? '').trim();
  const work = (input.work ?? '').trim();
  const length = (input.length ?? '').trim();
  const message = (input.message ?? '').trim();

  if (!name || name.length > 120) errors.name = 'Enter your name.';
  if (phone && phone.replace(/\D/g, '').length < 7) errors.phone = 'That phone number is too short.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'That email does not look complete.';
  if (!phone && !email) errors.phone = 'Add a phone number or an email.';
  if (!city || city.length > 80) errors.city = 'Enter the city.';
  if (!propertyLabels[property]) errors.property = 'Choose residential or commercial.';
  if (!workLabels[work]) errors.work = 'Choose the kind of work.';
  if (length && !lengthLabels[length]) errors.length = 'Choose a length, or leave it blank.';
  if (message.length > 2000) errors.message = 'Shorten the note to 2,000 characters.';
  return errors;
}

function compose(input: Record<string, string>): string {
  const length = (input.length ?? '').trim();
  return [
    'Dura Fence Metal — quote request',
    `Name: ${(input.name ?? '').trim()}`,
    `Phone: ${(input.phone ?? '').trim() || 'not given'}`,
    `Email: ${(input.email ?? '').trim() || 'not given'}`,
    `City: ${(input.city ?? '').trim()}`,
    `Property: ${propertyLabels[(input.property ?? '').trim()] ?? ''}`,
    `Work: ${workLabels[(input.work ?? '').trim()] ?? ''}`,
    `Length: ${length ? (lengthLabels[length] ?? length) : 'not given'}`,
    `Note: ${(input.message ?? '').trim() || 'none'}`,
  ].join('\n');
}

async function sendMail(env: Env, input: Record<string, string>, text: string): Promise<void> {
  const email = (input.email ?? '').trim();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.QUOTE_FROM,
      to: [env.QUOTE_TO],
      ...(email ? { reply_to: email } : {}),
      subject: `Quote request — ${(input.name ?? '').trim()}`,
      text,
    }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}`);
}

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const asJson = wantsJson(request);
  const fail = (status: number, title: string, error: string, fields?: Record<string, string>, extraHtml = '') => {
    if (asJson) return json({ ok: false, error, fields }, status);
    const list = fields
      ? `<ul>${Object.values(fields).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '';
    return html(title, `${list}${extraHtml}`, status);
  };

  const lengthHeader = Number(request.headers.get('content-length') ?? '0');
  if (lengthHeader > 20_000) return fail(413, 'That request is too long.', 'too_large');

  const payload = await readPayload(request);
  if (!payload) return fail(400, 'The form could not be read.', 'invalid');
  if ((payload.company ?? '').trim()) {
    return asJson ? json({ ok: true }) : html('Request sent.', '<p>Request sent.</p>', 200);
  }

  const fields = validate(payload);
  if (Object.keys(fields).length > 0) return fail(400, 'Check the form.', 'invalid', fields);

  const text = compose(payload);
  if (!env.RESEND_API_KEY || !env.QUOTE_TO || !env.QUOTE_FROM) {
    return fail(503, 'The request was not sent.', 'not_configured', undefined, `<pre>${escapeHtml(text)}</pre>`);
  }

  try {
    await sendMail(env, payload, text);
  } catch {
    return fail(502, 'The request was not sent.', 'email_failed', undefined, `<pre>${escapeHtml(text)}</pre>`);
  }

  if (asJson) return json({ ok: true });
  return html('Request sent.', '<p>Request sent. A measurement comes before a price.</p>', 200);
};
