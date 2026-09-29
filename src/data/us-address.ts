type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

type PhotonFeature = {
  properties?: {
    countrycode?: unknown;
    housenumber?: unknown;
    street?: unknown;
    city?: unknown;
    state?: unknown;
    postcode?: unknown;
  };
};

function part(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function addressSuggestions(query: string, fetcher: Fetcher = fetch): Promise<string[]> {
  const q = query.trim();
  if (q.length < 4 || q.length > 200) return [];
  const url = new URL('https://photon.komoot.io/api/');
  url.search = new URLSearchParams({ q, countrycode: 'US', limit: '8', lang: 'en' }).toString();
  const response = await fetcher(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Address suggestions are unavailable');
  const body = await response.json() as { features?: PhotonFeature[] };
  if (!Array.isArray(body.features)) throw new Error('Invalid address suggestions');
  return [...new Set(body.features.flatMap(({ properties: p }) => {
    if (!p || part(p.countrycode).toUpperCase() !== 'US') return [];
    const number = part(p.housenumber);
    const street = part(p.street);
    const city = part(p.city);
    const state = part(p.state);
    const zip = part(p.postcode);
    if (!number || !street || !city || !state) return [];
    return [`${number} ${street}, ${city}, ${state}${zip ? ` ${zip}` : ''}`];
  }))].slice(0, 5);
}

export type AddressValidation =
  | { kind: 'valid'; matchedAddress: string }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

export async function validateUsAddress(address: string, fetcher: Fetcher = fetch): Promise<AddressValidation> {
  const value = address.trim();
  if (value.length < 10 || value.length > 200 || !/^\d+[\w-]*\s+.+,.+,.+/u.test(value)) return { kind: 'invalid' };
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.search = new URLSearchParams({ address: value, benchmark: 'Public_AR_Current', format: 'json' }).toString();
  try {
    const response = await fetcher(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) return { kind: 'unavailable' };
    const body = await response.json() as { result?: { addressMatches?: { matchedAddress?: unknown }[] } };
    if (!Array.isArray(body.result?.addressMatches)) return { kind: 'unavailable' };
    const matchedAddress = part(body.result?.addressMatches?.[0]?.matchedAddress);
    return matchedAddress ? { kind: 'valid', matchedAddress } : { kind: 'invalid' };
  } catch {
    return { kind: 'unavailable' };
  }
}
