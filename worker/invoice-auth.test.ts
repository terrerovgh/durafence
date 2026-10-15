import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyAccessToken, accessConfigured } from './invoice-auth.ts';
import { accessFixture } from './invoice-test-db.ts';

test('Access verifies real signatures, issuer, audience, expiry and not-before',async () => {
  const fixture=await accessFixture(), keys=async () => [fixture.key];
  const valid=await fixture.issue();
  assert.deepEqual(await verifyAccessToken(valid,fixture.issuer,fixture.audience,keys),{email:'seller@example.test'});
  for(const overrides of [{exp:0},{iss:'https://other.test'},{aud:['other']},{nbf:Math.floor(Date.now()/1000)+600}]) {
    await assert.rejects(verifyAccessToken(await fixture.issue(overrides),fixture.issuer,fixture.audience,keys));
  }
  const parts=valid.split('.'); parts[1]=Buffer.from(JSON.stringify({email:'attacker@example.test'})).toString('base64url');
  await assert.rejects(verifyAccessToken(parts.join('.'),fixture.issuer,fixture.audience,keys));
  assert.equal(accessConfigured({}),false);
  assert.equal(accessConfigured({INVOICE_ACCESS_ISSUER:'http://unsafe.test',INVOICE_ACCESS_AUD:'x'}),false);
});


test('Access rejects signed exp and nbf values that are not finite safe integers',async (t) => {
  const fixture = await accessFixture(), keys = async () => [fixture.key], now = 2000000000;
  const cases = [
    { claim:'exp',literal:'1e309' },
    { claim:'exp',literal:'9007199254740992' },
    { claim:'exp',literal:'2000000300.5' },
    { claim:'nbf',literal:'-1e309' },
    { claim:'nbf',literal:'-9007199254740992' },
    { claim:'nbf',literal:'1999999999.5' },
  ];
  for (const entry of cases) {
    await t.test(entry.claim + '=' + entry.literal,async () => {
      const claims = {
        iss:fixture.issuer,aud:[fixture.audience],email:'seller@example.test',exp:now+300,
        [entry.claim]:'SIGNED_NUMBER_LITERAL',
      };
      const raw = JSON.stringify(claims).replace(JSON.stringify('SIGNED_NUMBER_LITERAL'),entry.literal);
      const token = await fixture.issueRaw(raw);
      await assert.rejects(verifyAccessToken(token,fixture.issuer,fixture.audience,keys,now));
    });
  }
});

test('Access accepts safe-integer dates without an arbitrary lifetime cap',async () => {
  const fixture = await accessFixture(), keys = async () => [fixture.key], now = 2000000000;
  for (const exp of [now+30*24*60*60,Number.MAX_SAFE_INTEGER]) {
    const token = await fixture.issue({ exp,nbf:now-1 });
    assert.deepEqual(
      await verifyAccessToken(token,fixture.issuer,fixture.audience,keys,now),
      { email:'seller@example.test' },
    );
  }
});
