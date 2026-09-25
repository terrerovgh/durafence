import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { amountDueCents, applyDiscount, cardTaxCents, depositCents, estimateSummary, formatFeetInches, formatMoney, formatReceiptMoney, paymentSummary, postsForRun, priceEstimate, type EstimateInput } from './estimate.ts';

function input(over: Partial<EstimateInput> = {}): EstimateInput {
  return {
    lengthFt: 0,
    packageId: 'premium',
    labor: 'installed',
    extraGates: { ft12: 0, ft6: 0, ft3: 0 },
    extraScrewLb: 0,
    aluminumGates: [],
    ...over,
  };
}

function material(result: ReturnType<typeof priceEstimate>, label: string) {
  const found = result.materials.find((line) => line.label === label);
  assert.ok(found, label);
  return found;
}

describe('priceEstimate', () => {
  it('prices the premium example and counts its materials', () => {
    const result = priceEstimate(
      input({
        lengthFt: 100,
        packageId: 'premium',
        labor: 'installed',
        extraGates: { ft12: 0, ft6: 1, ft3: 0 },
        extraScrewLb: 2,
        aluminumGates: [{ widthFt: 12, labor: 'installed' }],
      }),
    );

    assert.equal(material(result, '6 in pickets').value, '200');
    assert.equal(material(result, '6 in pickets').detail, 'side by side');
    assert.equal(material(result, 'Line posts').value, '26');
    assert.equal(material(result, 'Line posts').detail, 'every 4 ft');
    assert.equal(material(result, 'Rails').value, '3 × 100 ft');
    assert.equal(material(result, 'Screws, included').value, '600');
    assert.equal(material(result, '12 ft gate, included').value, '1');
    assert.equal(material(result, '6 ft gate').value, '1');
    assert.equal(material(result, 'Extra screws').value, '2 lb');
    assert.equal(material(result, 'Ringbell camera').value, '1');
    assert.equal(material(result, 'Ringbell camera').detail, 'included');
    assert.equal(material(result, 'Aluminum woven gate').value, '12 ft');
    assert.equal(material(result, 'Aluminum posts').value, '4');
    assert.equal(material(result, 'Closure').value, '1');

    assert.deepEqual(
      result.prices.map((line) => line.amountCents),
      [400_000, 50_000, 30_000, 360_000],
    );
    assert.equal(result.totalCents, 840_000);
    assert.equal(formatMoney(result.totalCents), '$8,400');
    assert.equal(result.issues.length, 0);
    assert.equal(estimateSummary(result).includes('Preliminary total: $8,400'), true);
    assert.equal(cardTaxCents(result.totalCents, false), 0);
    assert.equal(cardTaxCents(result.totalCents, true), 58_800);
    assert.equal(amountDueCents(result.totalCents, true), 898_800);
    assert.equal(depositCents(amountDueCents(result.totalCents, true)), 224_700);
    assert.equal(paymentSummary(result.totalCents, false).includes('Due with request (25%): $2,100'), true);
    assert.equal(paymentSummary(result.totalCents, true).includes('Tax (7%): $588'), true);
    assert.equal(paymentSummary(result.totalCents, true).includes('Due with request (25%): $2,247'), true);
    assert.equal(result.prices.some((line) => line.label.includes('included')), false);
    assert.deepEqual(
      result.groups.map((group) => [group.id, group.subtotalCents]),
      [
        ['fence', 400_000],
        ['gates', 50_000],
        ['screws', 30_000],
        ['aluminum', 360_000],
      ],
    );
    assert.equal(
      result.groups.reduce((sum, group) => sum + group.subtotalCents, 0),
      result.totalCents,
    );
  });

  it('prices standard materials only, with the included gate and no extras', () => {
    const result = priceEstimate(input({ lengthFt: 60, packageId: 'standard', labor: 'materials' }));

    assert.equal(material(result, '6 in pickets').value, '120');
    assert.equal(material(result, 'Line posts').value, '11');
    assert.equal(material(result, 'Rails').value, '2 × 60 ft');
    assert.equal(material(result, 'Screws, included').value, '240');
    assert.equal(material(result, '12 ft gate, included').value, '1');
    assert.equal(material(result, 'Ringbell camera').value, '1');
    assert.equal(result.prices.length, 1);
    assert.equal(result.prices[0]?.amountCents, 120_000);
    assert.equal(result.totalCents, 120_000);
    assert.equal(formatMoney(result.totalCents), '$1,200');
  });

  it('prices one extra 12 ft gate with no fence and no included gate', () => {
    const result = priceEstimate(input({ extraGates: { ft12: 1, ft6: 0, ft3: 0 } }));

    assert.equal(result.materials.length, 1);
    assert.equal(material(result, '12 ft gate').value, '1');
    assert.equal(result.materials.some((line) => line.label.includes('included')), false);
    assert.equal(result.materials.some((line) => line.label === '6 in pickets'), false);
    assert.equal(result.totalCents, 100_000);
    assert.equal(formatMoney(result.totalCents), '$1,000');
    assert.equal(result.hasFence, false);
  });

  it('puts an end post on a run that does not land on the spacing', () => {
    assert.equal(postsForRun(10, 4), 4);
    const result = priceEstimate(input({ lengthFt: 10 }));
    assert.equal(material(result, 'Line posts').value, '4');
    assert.equal(material(result, '6 in pickets').value, '20');
  });

  it('rounds a partial foot up to a whole picket', () => {
    const result = priceEstimate(input({ lengthFt: 10.25 }));
    assert.equal(material(result, '6 in pickets').value, '21');
    assert.equal(result.prices[0]?.amountCents, 41_000);
    assert.equal(formatMoney(41_000), '$410');
  });

  it('keeps extra gate prices flat when the fence is materials only', () => {
    const result = priceEstimate(
      input({
        lengthFt: 10,
        packageId: 'standard',
        labor: 'materials',
        extraGates: { ft12: 1, ft6: 0, ft3: 0 },
      }),
    );
    assert.equal(result.totalCents, 20_000 + 100_000);
  });

  it('prices aluminum materials on their own rate and post spacing', () => {
    const result = priceEstimate(
      input({
        labor: 'installed',
        aluminumGates: [{ widthFt: 8, labor: 'materials' }],
      }),
    );
    assert.equal(material(result, 'Aluminum posts').value, '3');
    assert.equal(material(result, 'Closure').value, '1');
    assert.equal(result.totalCents, 200_000);
    assert.equal(result.prices[0]?.label, 'Aluminum woven gate, materials only');
  });

  it('sells extra screws by the pound', () => {
    const result = priceEstimate(input({ extraScrewLb: 2.5 }));
    assert.equal(result.totalCents, 37_500);
    assert.equal(formatMoney(result.totalCents), '$375');
    assert.equal(material(result, 'Extra screws').value, '2.5 lb');
  });

  it('counts two 3 ft gates', () => {
    const result = priceEstimate(input({ extraGates: { ft12: 0, ft6: 0, ft3: 2 } }));
    assert.equal(material(result, '3 ft gate').value, '2');
    assert.equal(result.totalCents, 50_000);
  });

  it('drops a length past 5,000 feet and reports it', () => {
    const result = priceEstimate(input({ lengthFt: 6000 }));
    assert.equal(result.empty, true);
    assert.equal(result.totalCents, 0);
    assert.equal(result.issues[0]?.field, 'length');
    assert.equal(result.materials.some((line) => line.label === '6 in pickets'), false);
  });

  it('drops a negative screw weight', () => {
    const result = priceEstimate(input({ extraScrewLb: -1 }));
    assert.equal(result.empty, true);
    assert.equal(result.issues[0]?.field, 'screws');
  });

  it('formats cents when the amount is not a whole dollar', () => {
    assert.equal(formatMoney(15_050), '$150.50');
    assert.equal(formatMoney(0), '$0');
    assert.equal(formatReceiptMoney(840_000), '$8,400.00');
    assert.equal(depositCents(1), 0);
    assert.equal(depositCents(3), 1);
    assert.equal(depositCents(37_500), 9_375);
    assert.equal(cardTaxCents(1, true), 0);
    assert.equal(cardTaxCents(15, true), 1);
    assert.equal(formatFeetInches(4), `4'-0"`);
    assert.equal(formatFeetInches(0.5), '6"');
    assert.equal(formatFeetInches(6.5), `6'-6"`);
  });

  it('reads dollar and percent discount codes', () => {
    const subtotal = 840_000;
    assert.equal(applyDiscount(subtotal, 'ABE90').appliedCents, 9_000);
    assert.equal(applyDiscount(subtotal, 'abe20').appliedCents, 2_000);
    assert.equal(applyDiscount(subtotal, 'DURA10').appliedCents, 84_000);
    assert.equal(applyDiscount(subtotal, 'dura8').appliedCents, 67_200);
    assert.equal(applyDiscount(subtotal, 'DURA10').percent, 10);
    assert.equal(applyDiscount(5_000, 'ABE90').appliedCents, 5_000);
    assert.equal(applyDiscount(subtotal, '').kind, 'none');
    assert.equal(applyDiscount(subtotal, 'SAVE10').kind, 'invalid');
    assert.equal(applyDiscount(subtotal, 'DURA150').kind, 'invalid');
    assert.equal(applyDiscount(subtotal, 'ABE').kind, 'invalid');

    const due = amountDueCents(400_000, true, 'ABE90');
    assert.equal(due, 391_000 + 27_370);
    assert.equal(depositCents(due), 104_593);
    assert.equal(paymentSummary(400_000, false, 'DURA10').includes('Discount DURA10: -$400'), true);
    assert.equal(paymentSummary(400_000, false, 'DURA10').includes('Total due: $3,600'), true);
  });

  it('returns an empty summary when nothing was asked for', () => {
    assert.equal(estimateSummary(priceEstimate(input())), '');
  });
});
