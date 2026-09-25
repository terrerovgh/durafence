import { ESTIMATE_STORAGE_KEY } from '../data/estimate';

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

type Payload = Record<string, string>;

function value(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  if (field instanceof RadioNodeList) return String(field.value ?? '').trim();
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return field.value.trim();
  }
  return '';
}

export function validateQuote(input: Payload): Record<string, string> {
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

export function composeQuote(input: Payload): string {
  const length = (input.length ?? '').trim();
  return [
    'Dura Fence Metal — quote request',
    `Name: ${(input.name ?? '').trim()}`,
    `Phone: ${(input.phone ?? '').trim() || 'not given'}`,
    `Email: ${(input.email ?? '').trim() || 'not given'}`,
    `City: ${(input.city ?? '').trim()}`,
    `Property: ${propertyLabels[(input.property ?? '').trim()] ?? (input.property ?? '').trim()}`,
    `Work: ${workLabels[(input.work ?? '').trim()] ?? (input.work ?? '').trim()}`,
    `Length: ${length ? (lengthLabels[length] ?? length) : 'not given'}`,
    `Note: ${(input.message ?? '').trim() || 'none'}`,
  ].join('\n');
}

function prefillEstimate(form: HTMLFormElement): void {
  const message = form.elements.namedItem('message');
  if (!(message instanceof HTMLTextAreaElement) || message.value.trim()) return;
  try {
    const saved = sessionStorage.getItem(ESTIMATE_STORAGE_KEY);
    if (!saved) return;
    message.value = saved.length > 2000 ? `${saved.slice(0, 1960).trimEnd()}\n…` : saved;
  } catch {
    // Private browsing can block storage.
  }
}

function payloadFrom(form: HTMLFormElement): Payload {
  return {
    name: value(form, 'name'),
    phone: value(form, 'phone'),
    email: value(form, 'email'),
    city: value(form, 'city'),
    property: value(form, 'property'),
    work: value(form, 'work'),
    length: value(form, 'length'),
    message: value(form, 'message'),
    company: value(form, 'company'),
  };
}

function showErrors(form: HTMLFormElement, errors: Record<string, string>) {
  form.querySelectorAll<HTMLElement>('[data-error-for]').forEach((slot) => {
    slot.hidden = true;
    slot.textContent = '';
  });
  form.querySelectorAll<HTMLElement>('[aria-invalid="true"]').forEach((field) => {
    field.removeAttribute('aria-invalid');
  });

  let first: HTMLElement | null = null;
  for (const [name, message] of Object.entries(errors)) {
    const slot = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
    if (slot) {
      slot.hidden = false;
      slot.textContent = message;
    }
    form.querySelectorAll<HTMLElement>(`[name="${CSS.escape(name)}"]`).forEach((field) => {
      field.setAttribute('aria-invalid', 'true');
      if (slot?.id) field.setAttribute('aria-describedby', slot.id);
      if (!first) first = field;
    });
  }

  const status = form.querySelector<HTMLElement>('[data-status]');
  if (status) status.textContent = 'Fix the marked fields and send it again.';
  first?.focus();
}

export function mountQuoteForm(): void {
  const form = document.querySelector<HTMLFormElement>('[data-quote-form]');
  if (!form || form.dataset.ready === 'true') return;
  form.dataset.ready = 'true';

  prefillEstimate(form);

  const status = form.querySelector<HTMLElement>('[data-status]');
  const copyWrap = form.querySelector<HTMLElement>('[data-copy]');
  const copyText = form.querySelector<HTMLElement>('[data-copy-text]');
  const copyButton = form.querySelector<HTMLButtonElement>('[data-copy-button]');
  const submit = form.querySelector<HTMLButtonElement>('[type="submit"]');

  const showCopy = (text: string, message: string) => {
    if (status) status.textContent = message;
    if (copyText) copyText.textContent = text;
    if (copyWrap) copyWrap.hidden = false;
    submit && (submit.disabled = false);
  };

  copyButton?.addEventListener('click', async () => {
    const text = copyText?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      if (status) status.textContent = 'Copied.';
    } catch {
      if (status) status.textContent = 'Select the request below and copy it.';
      copyText?.focus();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = payloadFrom(form);
    const errors = validateQuote(payload);
    if (Object.keys(errors).length > 0) {
      showErrors(form, errors);
      return;
    }

    if (submit) submit.disabled = true;
    if (status) status.textContent = 'Sending…';
    if (copyWrap) copyWrap.hidden = true;

    const text = composeQuote(payload);
    const email = (form.dataset.email ?? '').trim();

    try {
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
        if (body?.ok) {
          if (status) status.textContent = 'Request sent. A measurement comes before a price.';
          form.querySelectorAll<HTMLElement>('input, select, textarea, button').forEach((field) => {
            if (field !== copyButton) field.setAttribute('disabled', '');
          });
          return;
        }
      } else if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as { fields?: Record<string, string> } | null;
        if (body?.fields && Object.keys(body.fields).length > 0) {
          showErrors(form, body.fields);
          if (submit) submit.disabled = false;
          return;
        }
      }
    } catch {
      // The Pages Function is not available from this browser.
    }

    if (email) {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Quote request — ${payload.name}`)}&body=${encodeURIComponent(text)}`;
      showCopy(text, 'Your email app should open with this request. If it does not, copy the text below.');
      return;
    }

    showCopy(text, 'The request is ready. Copy it — this page could not deliver it.');
  });
}
