/** Public facts for Dura Fence Metal. Leave phone and email empty until they are real. */

export const siteUrl = 'https://durafencemetal.com';

/** E.164-style telephone for structured data. Display copy keeps the local format. */
export function schemaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone.trim();
}

export const site = {
  name: 'Dura Fence Metal',
  shortName: 'Dura Fence',
  metal: 'Metal',
  tagline: 'Built Stronger for a Brighter Tomorrow',
  region: 'South Georgia',
  description:
    'Metal privacy fences, pedestrian and driveway gates, planks, and fence parts in South Georgia. Compare finishes and build your Dura Fence Metal estimate.',
  phone: '678 622 1776',
  email: '',
  // Working trip list. Remove a town if the crew does not go there.
  cities: [
    'Valdosta',
    'Hahira',
    'Adel',
    'Nashville',
    'Tifton',
    'Moultrie',
    'Thomasville',
    'Quitman',
    'Waycross',
    'Douglas',
  ],
};

export const nav = [
  { href: '/services/', label: 'Fences' },
  { href: '/gates/', label: 'Gates' },
  { href: '/parts/', label: 'Parts' },
  { href: '/service-area/', label: 'Service area' },
  { href: '/estimate/', label: 'Estimates' },
] as const;

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
