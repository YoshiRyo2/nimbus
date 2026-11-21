import { describe, expect, it } from 'vitest';
import { estimateBody } from '../../domain/body';
import { FIT_TEST_COLUMNS, fitGarment, preferenceSpec, readFitTestCsv, sampleFit } from '../../domain/fit';
import { findGarment } from '../../domain/garments';
import { anchorText, answersFor, csvField, csvFileName, fitTestsCsv, makeFitTest, predictionFor, testQuestions } from './fitTests';
import { isFitTestList } from './stored';

const body = { heightCm: 178, weightKg: 75, bodyType: 'mens' } as const;
const model = estimateBody(body);
const gildan = findGarment('gildan-5000')!;

function predict(anchor: Parameters<typeof preferenceSpec>[0] = null) {
  const preference = preferenceSpec(anchor, null);
  return predictionFor({ body, model, garment: gildan, size: 'M', preference, anchor, odds: sampleFit(model, gildan, preference) });
}

describe('predictionFor', () => {
  it('freezes the body, preference, recommendation and chances for one size', () => {
    const p = predict();
    expect(p.chestSource).toBe('estimated');
    expect(p.preferenceSource).toBe('default');
    expect(p.preferredChestEaseCm).toBe(5);
    expect(p.preferredLengthDiffCm).toBeNull();
    expect(p.recommendedSize).toBe('M');
    expect(p.chestLabel).toBe('relaxed');
    expect(p.chest.under + p.chest.right + p.chest.over).toBeCloseTo(1);
    expect(p.likes).toBeGreaterThan(0);
  });

  it('records the anchor', () => {
    const p = predict({ kind: 'measured', chestFlatCm: 53, lengthCm: 74 });
    expect(p.anchor).toBe('measured 53x74 cm');
    expect(p.preferredChestEaseCm).toBeCloseTo(106 - model.measurements.chestCm);
    expect(p.preferredLengthDiffCm).toBeCloseTo(74 - model.measurements.torsoLengthCm);
  });
});

describe('fitTestsCsv', () => {
  const answers = { tester: ' T01 ', chest: 'just-right', length: 'too-short', keptSize: 'M' } as const;
  const later = makeFitTest('b', '2026-11-19T10:00:00Z', 'gildan-5000', 'L', { ...answers, keptSize: null }, predict());
  const earlier = makeFitTest('a', '2026-11-18T10:00:00Z', 'gildan-5000', 'M', answers, predict());

  it('makes records the stored guard accepts', () => {
    expect(isFitTestList([earlier, later])).toBe(true);
    expect(earlier.tester).toBe('T01');
  });

  it('writes the header, then rows oldest first, that read back by column', () => {
    const csv = fitTestsCsv([later, earlier]);
    expect(csv.split('\n')[0]).toBe(FIT_TEST_COLUMNS.join(','));
    const rows = readFitTestCsv(csv);
    expect(rows.map((r) => r.size)).toEqual(['M', 'L']);
    expect(rows[0]).toMatchObject({
      tester: 'T01',
      actual_chest: 'just-right',
      actual_length: 'too-short',
      kept_size: 'M',
      recommended_size: 'M',
      preference_source: 'default',
      chest_source: 'estimated',
      preferred_length_diff_cm: '',
    });
    expect(rows[1]?.kept_size).toBe('none');
    expect(Number(rows[0]?.p_chest_just_right)).toBeCloseTo(earlier.prediction.chest.right, 3);
  });

  it('quotes fields that need it', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a, "b"')).toBe('"a, ""b"""');
  });
});

describe('small helpers', () => {
  it('names the anchor and the file', () => {
    expect(anchorText({ kind: 'catalogue', garmentId: 'gildan-5000', size: 'M' })).toBe('gildan-5000 M');
    expect(anchorText(null)).toBe('');
    expect(csvFileName(new Date(2026, 10, 8))).toBe('choudo-fit-tests-2026-11-08.csv');
  });
});

describe('bottoms', () => {
  it('predictionFor a skirt asks about its length, where the hem lands', () => {
    const skirt = findGarment('landsend-a-line-skirt')!;
    const preference = preferenceSpec(null, null);
    const p = predictionFor({ body, model, garment: skirt, size: '8', preference, anchor: null, odds: sampleFit(model, skirt, preference) });
    expect(p.category).toBe('bottom');
    expect(p.lengthLabel).toBe('noted');
  });

  const jean = findGarment('corvo-slim-jean')!;
  const preference = preferenceSpec(null, null);
  // A body whose own front rise (≈ 27 cm) is longer than the jean's 25.5 cm, so the band sits below the navel.
  const jeanBody = { heightCm: 178, weightKg: 88, bodyType: 'mens', overrides: { waistCm: 82 } } as const;
  const jeanModel = estimateBody(jeanBody);
  const predictJean = () =>
    predictionFor({ body: jeanBody, model: jeanModel, garment: jean, size: '32x32', preference, anchor: null, odds: sampleFit(jeanModel, jean, preference) });

  it('predictionFor a jean records waist, thigh and inseam', () => {
    const p = predictJean();
    expect(p.category).toBe('bottom');
    expect(p.inseamCm).toBe(jeanModel.measurements.inseamCm);
    expect(p.thighCm).toBe(jeanModel.measurements.thighCm);
    // The body at the band, not the navel waist.
    expect(jeanModel.measurements.frontRiseCm).toBeGreaterThan(25.5);
    expect(p.waistCm).toBeGreaterThan(jeanModel.measurements.waistCm);
    expect(p.waistLabel).toBe('fitted');
    expect(p.thighLabel).not.toBe('unknown');
    expect(p.lengthLabel).toBe('good'); // the inseam
    expect(p.preferredChestEaseCm).toBeNull();
    expect(p.waist!.under + p.waist!.right + p.waist!.over).toBeCloseTo(1);
    expect(p.thigh!.under + p.thigh!.right + p.thigh!.over).toBeCloseTo(1);
    expect(p.length.under + p.length.right + p.length.over).toBeCloseTo(1);
  });

  it('a top records no bottoms fields', () => {
    const p = predict();
    expect(p.category).toBe('top');
    expect(p.waist).toBeUndefined();
    expect(p.thigh).toBeUndefined();
  });

  it('fitTestRow writes the bottoms columns, and leaves the chest blank', () => {
    const r = makeFitTest('j', '2026-11-20T10:00:00Z', jean.id, '32x32', { tester: 'T01', chest: null, waist: 'too-tight', thigh: 'just-right', length: 'too-long', keptSize: '34x32' }, predictJean());
    expect(isFitTestList([r])).toBe(true);
    const [row] = readFitTestCsv(fitTestsCsv([r]));
    expect(row).toMatchObject({
      category: 'bottom',
      actual_chest: '',
      p_chest_too_tight: '',
      predicted_chest_label: '',
      preferred_chest_ease_cm: '',
      actual_waist: 'too-tight',
      actual_thigh: 'just-right',
      actual_length: 'too-long',
      predicted_waist_label: 'fitted',
    });
    expect(Number(row!.p_waist_just_right)).toBeGreaterThan(0);
    expect(Number(row!.inseam_cm)).toBeCloseTo(jeanModel.measurements.inseamCm, 1);
  });

  it('a top row leaves the bottoms columns blank', () => {
    const r = makeFitTest('t', '2026-11-20T10:00:00Z', 'gildan-5000', 'M', { tester: 'T01', chest: 'just-right', length: 'just-right', keptSize: 'M' }, predict());
    const [row] = readFitTestCsv(fitTestsCsv([r]));
    expect(row).toMatchObject({ category: 'top', actual_waist: '', p_waist_too_tight: '', actual_thigh: '' });
  });
});

describe('testQuestions', () => {
  it('asks a top about the chest and length', () => {
    expect(testQuestions(fitGarment(model, gildan, 'M'), gildan)).toEqual(['chest', 'length']);
  });

  it('asks a jean about the waist, thigh and inseam, and skips a thigh it could not score', () => {
    const jean = findGarment('corvo-slim-jean')!;
    expect(testQuestions(fitGarment(model, jean, '32x32'), jean)).toEqual(['waist', 'thigh', 'length']);
    const chino = findGarment('fieldline-slim-chino')!;
    expect(testQuestions(fitGarment(model, chino, '32'), chino)).toEqual(['waist', 'length']);
  });
});

describe('answersFor', () => {
  it('is null until every question has an answer, then the answers for this category', () => {
    const picked = { chest: null, waist: 'too-tight', thigh: null, length: 'just-right' } as const;
    expect(answersFor(['waist', 'thigh', 'length'], { ...picked }, 'T01', '32x32')).toBeNull();
    expect(answersFor(['waist', 'length'], { ...picked, chest: 'just-right' }, 'T01', '32x32')).toEqual({
      tester: 'T01',
      chest: null,
      waist: 'too-tight',
      length: 'just-right',
      keptSize: '32x32',
    });
    expect(answersFor(['chest', 'length'], { ...picked, chest: 'just-right' }, ' ', 'M')).toBeNull();
  });
});

describe('Test mode on a jacket', () => {
  const jacket = findGarment('port-authority-j317')!;
  const hoodie = findGarment('gildan-18500')!;
  const under = { garment: hoodie, sizeLabel: 'L' };
  const preference = preferenceSpec(null, null);
  const odds = sampleFit(model, jacket, preference, { under });
  const p = predictionFor({ body, model, garment: jacket, size: 'L', preference, anchor: null, odds, under });

  it('asks the chest and the sleeve, as a top', () => {
    expect(testQuestions(fitGarment(model, jacket, 'L', under), jacket)).toEqual(['chest', 'length']);
  });

  it('records it as an outer layer, over what was under it, with the sleeve as its length', () => {
    expect(p.category).toBe('outer');
    expect(p.wornOver).toBe('gildan-18500 L');
    const layered = fitGarment(model, jacket, 'L', under);
    expect(p.chestLabel).toBe(layered.zones.find((z) => z.zone === 'chest')!.label);
    expect(p.lengthLabel).toBe(layered.zones.find((z) => z.zone === 'sleeve')!.label);
    expect(p.preferredChestEaseCm).not.toBeNull();
  });

  it('stores, and writes the CSV with the chest and a worn_over column', () => {
    const r = makeFitTest('j', '2026-11-20T10:00:00Z', jacket.id, 'L', { tester: 'T02', chest: 'just-right', length: 'too-long', keptSize: 'L' }, p);
    expect(r.category).toBe('outer');
    expect(isFitTestList([r])).toBe(true);
    const [row] = readFitTestCsv(fitTestsCsv([r]));
    expect(row).toMatchObject({ category: 'outer', worn_over: 'gildan-18500 L', actual_chest: 'just-right' });
    expect(row!.p_chest_just_right).not.toBe('');
    expect(FIT_TEST_COLUMNS[FIT_TEST_COLUMNS.length - 1]).toBe('worn_over');
  });

  it('leaves worn_over blank for a jacket tried on alone', () => {
    const alone = predictionFor({ body, model, garment: jacket, size: 'L', preference, anchor: null, odds: sampleFit(model, jacket, preference) });
    expect(alone.wornOver).toBeUndefined();
    const r = makeFitTest('k', '2026-11-20T10:00:00Z', jacket.id, 'L', { tester: 'T02', chest: 'just-right', length: 'too-long', keptSize: 'L' }, alone);
    expect(readFitTestCsv(fitTestsCsv([r]))[0]!.worn_over).toBe('');
  });
});

describe('Test mode on a dress', () => {
  const woman = { heightCm: 163, weightKg: 68, bodyType: 'womens' } as const;
  const wModel = estimateBody(woman);
  const sheath = findGarment('landsend-sheath-dress')!;
  const surplice = findGarment('landsend-surplice-dress')!;
  const preference = preferenceSpec(null, null);
  const p = predictionFor({ body: woman, model: wModel, garment: sheath, size: '10', preference, anchor: null, odds: sampleFit(wModel, sheath, preference) });

  it('asks the bust, the waist when it is scored, and where the hem lands', () => {
    expect(testQuestions(fitGarment(wModel, sheath, '10'), sheath)).toEqual(['chest', 'waist', 'length']);
    expect(testQuestions(fitGarment(wModel, surplice, 'M'), surplice)).toEqual(['chest', 'length']);
  });

  it('records the bust, the waist at the seam and the hem landing', () => {
    expect(p.category).toBe('onepiece');
    const fit = fitGarment(wModel, sheath, '10');
    expect(p.chestLabel).toBe(fit.zones.find((z) => z.zone === 'chest')!.label);
    expect(p.waistLabel).toBe(fit.zones.find((z) => z.zone === 'waist')!.label);
    expect(p.lengthLabel).toBe('noted');
    expect(p.waist!.under + p.waist!.right + p.waist!.over).toBeCloseTo(1);
    expect(p.preferredChestEaseCm).toBeNull();
  });

  it('writes the chest and waist columns', () => {
    const r = makeFitTest('d', '2026-11-20T10:00:00Z', sheath.id, '10', { tester: 'T03', chest: 'just-right', waist: 'too-tight', length: 'just-right', keptSize: '12' }, p);
    expect(isFitTestList([r])).toBe(true);
    const [row] = readFitTestCsv(fitTestsCsv([r]));
    expect(row).toMatchObject({ category: 'onepiece', actual_chest: 'just-right', actual_waist: 'too-tight' });
    expect(row!.p_chest_just_right).not.toBe('');
    expect(row!.p_waist_just_right).not.toBe('');
    expect(row!.predicted_thigh_label).toBe('');
  });
});
