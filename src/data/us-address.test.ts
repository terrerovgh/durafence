import assert from 'node:assert/strict';
import { it } from 'node:test';
import { addressSuggestions, validateUsAddress } from './us-address.ts';
import { onRequestGet } from '../../functions/api/estimate-address.ts';

it('keeps only complete US street addresses in autocomplete results', async () => {
  const fetcher = async () => Response.json({ features: [
    { properties: { countrycode: 'US', housenumber: '1600', street: 'Pennsylvania Avenue Northwest', city: 'Washington', state: 'District of Columbia', postcode: '20500' } },
    { properties: { countrycode: 'US', street: 'Main Street', city: 'Valdosta', state: 'Georgia' } },
    { properties: { countrycode: 'CA', housenumber: '1', street: 'Main Street', city: 'Toronto', state: 'Ontario' } },
  ] });
  assert.deepEqual(await addressSuggestions('1600 Penn', fetcher), [
    '1600 Pennsylvania Avenue Northwest, Washington, District of Columbia 20500',
  ]);
});

it('accepts a Census address match and rejects an unmatched address', async () => {
  const matched = async () => Response.json({ result: { addressMatches: [{ matchedAddress: '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500' }] } });
  const unmatched = async () => Response.json({ result: { addressMatches: [] } });
  assert.equal((await validateUsAddress('1600 Pennsylvania Ave NW, Washington, DC 20500', matched)).kind, 'valid');
  assert.equal((await validateUsAddress('99999 Imaginary Road, Washington, DC 20500', unmatched)).kind, 'invalid');
});

it('distinguishes invalid input from an unavailable Census service', async () => {
  assert.equal((await validateUsAddress('Main Street', async () => { throw new Error('should not call'); })).kind, 'invalid');
  assert.equal((await validateUsAddress('1600 Pennsylvania Ave NW, Washington, DC 20500', async () => { throw new Error('offline'); })).kind, 'unavailable');
  assert.equal((await validateUsAddress('1600 Pennsylvania Ave NW, Washington, DC 20500', async () => Response.json({}))).kind, 'unavailable');
});

it('returns address suggestions and a validation result through the estimate API', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: URL) => {
    if (url.hostname === 'photon.komoot.io') {
      return Response.json({ features: [{ properties: { countrycode: 'US', housenumber: '1600', street: 'Pennsylvania Avenue Northwest', city: 'Washington', state: 'District of Columbia', postcode: '20500' } }] });
    }
    return Response.json({ result: { addressMatches: [{ matchedAddress: '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500' }] } });
  });
  const suggest = await onRequestGet({ request: new Request('https://durafencemetal.com/api/estimate-address?q=1600%20Penn') });
  assert.deepEqual((await suggest.json()).suggestions, ['1600 Pennsylvania Avenue Northwest, Washington, District of Columbia 20500']);
  const verify = await onRequestGet({ request: new Request('https://durafencemetal.com/api/estimate-address?address=1600%20Pennsylvania%20Ave%20NW%2C%20Washington%2C%20DC%2020500') });
  assert.deepEqual(await verify.json(), { valid: true });
});
