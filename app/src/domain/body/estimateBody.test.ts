import { describe, expect, it } from 'vitest';
import { inToCm } from '../units';
import {
  estimateBody,
  LEG_ESTIMATE_LIMITS,
  MENS_LEG_REGRESSION,
  MENS_MODEL,
  validateBodyInput,
  WOMENS_LEG_REGRESSION,
  WOMENS_REGRESSION,
} from './estimateBody';
import { BODY_MEASUREMENT_KEYS } from './types';
import type { BodyInput } from './types';

const average: BodyInput = { heightCm: 176, weightKg: 85, bodyType: 'mens' };

describe('estimateBody', () => {
  it('returns the reference body for the reference height and weight', () => {
    const { measurements: m } = estimateBody(average);
    const ref = MENS_MODEL.ref;
    expect(m.chestCm).toBeCloseTo(ref.chestCm);
    expect(m.waistCm).toBeCloseTo(ref.waistCm);
    expect(m.hipsCm).toBeCloseTo(ref.hipsCm);
  });

  it('gives plausible numbers for a slim man (180 cm, 65 kg)', () => {
    const { measurements: m } = estimateBody({ heightCm: 180, weightKg: 65, bodyType: 'mens' });
    expect(m.chestCm).toBeGreaterThan(84);
    expect(m.chestCm).toBeLessThan(94);
    expect(m.waistCm).toBeGreaterThan(70);
    expect(m.waistCm).toBeLessThan(80);
    expect(m.inseamCm).toBeCloseTo(81);
  });

  it('gives plausible numbers for a heavier man (175 cm, 110 kg)', () => {
    const { measurements: m } = estimateBody({ heightCm: 175, weightKg: 110, bodyType: 'mens' });
    expect(m.chestCm).toBeGreaterThan(114);
    expect(m.chestCm).toBeLessThan(126);
    expect(m.waistCm).toBeGreaterThan(m.chestCm - 10); // waist catches up with chest
  });

  it('uses the ANSUR II women’s regressions for a women’s body', () => {
    // At the survey means (162.8 cm, 67.8 kg) the lines give back the survey means.
    const { measurements: m } = estimateBody({ heightCm: 162.8, weightKg: 67.8, bodyType: 'womens' });
    expect(m.bodyType).toBe('womens');
    expect(m.chestCm).toBeCloseTo(94.7, 0);
    expect(m.waistCm).toBeCloseTo(86.1, 0);
    expect(m.hipsCm).toBeCloseTo(102.1, 0);
    expect(m.inseamCm).toBeCloseTo(78.2, 0);
    expect(m.hipsCm).toBeGreaterThan(m.chestCm);
  });

  it('gives a women’s body a bigger hip-to-waist drop than a men’s of the same size', () => {
    const w = estimateBody({ heightCm: 165, weightKg: 60, bodyType: 'womens' }).measurements;
    const men = estimateBody({ heightCm: 165, weightKg: 60, bodyType: 'mens' }).measurements;
    expect(w.hipsCm - w.waistCm).toBeGreaterThan(men.hipsCm - men.waistCm);
  });

  it('keeps women’s regressions in a plausible range far outside the survey', () => {
    const m = estimateBody({ heightCm: 230, weightKg: 30, bodyType: 'womens' }).measurements;
    expect(m.waistCm).toBeGreaterThanOrEqual(50);
    expect(m.chestCm).toBeGreaterThanOrEqual(60);
    expect(WOMENS_REGRESSION.waistCm.intercept + WOMENS_REGRESSION.waistCm.perCm * 230 + WOMENS_REGRESSION.waistCm.perKg * 30).toBeLessThan(50);
  });

  it('grows girths with weight and lengths with height', () => {
    const light = estimateBody({ ...average, weightKg: 70 }).measurements;
    const heavy = estimateBody({ ...average, weightKg: 100 }).measurements;
    expect(heavy.chestCm).toBeGreaterThan(light.chestCm);
    expect(heavy.waistCm - light.waistCm).toBeGreaterThan(heavy.chestCm - light.chestCm);

    const short = estimateBody({ ...average, heightCm: 165 }).measurements;
    const tall = estimateBody({ ...average, heightCm: 190 }).measurements;
    expect(tall.inseamCm).toBeGreaterThan(short.inseamCm);
    expect(tall.torsoLengthCm).toBeGreaterThan(short.torsoLengthCm);
    expect(tall.armLengthCm).toBeGreaterThan(short.armLengthCm);
  });

  it('lets entered measurements override estimates and records the source', () => {
    const model = estimateBody({ ...average, overrides: { chestCm: 99, inseamCm: 76 } });
    expect(model.measurements.chestCm).toBe(99);
    expect(model.measurements.inseamCm).toBe(76);
    expect(model.sources.chestCm).toBe('entered');
    expect(model.sources.inseamCm).toBe('entered');
    expect(model.sources.waistCm).toBe('estimated');
    expect(model.measurements.waistCm).toBeCloseTo(94);
  });

  it('treats an explicitly undefined override as not entered', () => {
    const model = estimateBody({ ...average, overrides: { chestCm: undefined } });
    expect(model.sources.chestCm).toBe('estimated');
  });

  it('estimates the bust from a bra size, but a measured bust wins', () => {
    const womens: BodyInput = { heightCm: 165, weightKg: 62, bodyType: 'womens' };
    const bra = estimateBody({ ...womens, overrides: { braSize: { band: 34, cup: 'C', system: 'us' } } });
    expect(bra.measurements.chestCm).toBeCloseTo(inToCm(37));
    expect(bra.sources.chestCm).toBe('estimated');
    expect(bra.bra).toEqual({ bandIn: 34, cupIn: 3, setsBust: true });

    const both = estimateBody({ ...womens, overrides: { chestCm: 90, braSize: { band: 34, cup: 'C', system: 'us' } } });
    expect(both.measurements.chestCm).toBe(90);
    expect(both.sources.chestCm).toBe('entered');
    expect(both.bra?.setsBust).toBe(false);

    expect(estimateBody(womens).bra).toBeUndefined();
  });

  it('throws on implausible input', () => {
    expect(() => estimateBody({ ...average, heightCm: 70 })).toThrow(RangeError);
    expect(() => estimateBody({ ...average, weightKg: Number.NaN })).toThrow(RangeError);
  });
});

describe('validateBodyInput', () => {
  it('accepts a normal input', () => {
    expect(validateBodyInput(average)).toEqual([]);
  });

  it('catches a height typed in inches instead of cm', () => {
    const errors = validateBodyInput({ ...average, heightCm: 70 });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe('heightCm');
  });

  it('checks overrides too (same 25–70 in chest range as src/fit.py)', () => {
    const errors = validateBodyInput({ ...average, overrides: { chestCm: 9 * 2.54 } });
    expect(errors.map((e) => e.field)).toEqual(['chestCm']);
  });

  it('calls the chest a bust for a women’s body', () => {
    const errors = validateBodyInput({ heightCm: 165, weightKg: 60, bodyType: 'womens', overrides: { chestCm: 20 } });
    expect(errors[0]?.message).toMatch(/^Bust should be/);
  });

  it('checks a bra size', () => {
    const errors = validateBodyInput({ heightCm: 165, weightKg: 60, bodyType: 'womens', overrides: { braSize: { band: 34, cup: 'Q', system: 'us' } } });
    expect(errors.map((e) => e.field)).toEqual(['braSize']);
  });
});

describe('leg keys (pants)', () => {
  const LEG_KEYS = ['thighCm', 'kneeCm', 'calfCm', 'heelAnkleCm', 'frontRiseCm', 'waistHeightCm', 'hipHeightCm', 'kneeHeightCm', 'ankleHeightCm'] as const;

  it('come after the original keys, in a fixed order', () => {
    expect(BODY_MEASUREMENT_KEYS.slice(7)).toEqual([...LEG_KEYS]);
    expect(Object.keys(WOMENS_LEG_REGRESSION).sort()).toEqual([...LEG_KEYS].sort());
    expect(Object.keys(MENS_LEG_REGRESSION).sort()).toEqual([...LEG_KEYS].sort());
  });

  it("women's leg keys follow the ANSUR II regressions", () => {
    const { measurements: m } = estimateBody({ heightCm: 163, weightKg: 68, bodyType: 'womens' });
    expect(m.thighCm).toBeCloseTo(61.7, 1);
    expect(m.frontRiseCm).toBeCloseTo(27.9, 1);
    expect(m.waistHeightCm).toBeCloseTo(98.1, 1);
    expect(m.hipHeightCm).toBeCloseTo(83.5, 1);
    expect(m.kneeHeightCm).toBeCloseTo(44.95, 1);
    // lateralmalleolusheight: 0.6924 + 0.0338 × 163 + 0.0011 × 68
    expect(m.ankleHeightCm).toBeCloseTo(6.28, 2);
  });

  it("men's leg keys follow the ANSUR II male regressions", () => {
    const { measurements: m } = estimateBody(average); // 176 cm, 85 kg
    expect(m.thighCm).toBeCloseTo(62.22, 1);
    expect(m.kneeCm).toBeCloseTo(40.79, 1);
    expect(m.calfCm).toBeCloseTo(39.11, 1);
    expect(m.heelAnkleCm).toBeCloseTo(34.35, 1);
    expect(m.frontRiseCm).toBeCloseTo(26.54, 1);
    expect(m.waistHeightCm).toBeCloseTo(105.96, 1);
    expect(m.hipHeightCm).toBeCloseTo(89.04, 1);
    expect(m.kneeHeightCm).toBeCloseTo(48.97, 1);
    expect(m.ankleHeightCm).toBeCloseTo(7.3, 1);
  });

  it("men's leg girths come from height and weight, not an entered hips", () => {
    const a = estimateBody(average).measurements;
    const b = estimateBody({ ...average, overrides: { hipsCm: 120 } }).measurements;
    expect([b.thighCm, b.kneeCm, b.calfCm]).toEqual([a.thighCm, a.kneeCm, a.calfCm]);
  });

  it("men's leg girths grow with weight", () => {
    const light = estimateBody({ ...average, weightKg: 65 }).measurements;
    expect(light.thighCm).toBeLessThan(estimateBody(average).measurements.thighCm - 7);
  });

  it("men's existing keys don't move", () => {
    const { measurements: m } = estimateBody(average);
    expect([m.chestCm, m.waistCm, m.hipsCm]).toEqual([104, 94, 103]);
    expect(m.inseamCm).toBeCloseTo(79.2, 10);
    expect(m.shoulderWidthCm).toBeCloseTo(45.76, 10);
    expect(m.armLengthCm).toBeCloseTo(61.6, 10);
    expect(m.torsoLengthCm).toBeCloseTo(72.16, 10);
  });

  it('keeps heights in order when an entered inseam is far from the estimate', () => {
    for (const bodyType of ['womens', 'mens'] as const) {
      const { measurements: m } = estimateBody({ heightCm: 160, weightKg: 60, bodyType, overrides: { inseamCm: 95 } });
      expect(m.inseamCm).toBe(95);
      expect(m.kneeHeightCm).toBeLessThan(95);
      expect(m.hipHeightCm).toBeGreaterThan(95);
      expect(m.waistHeightCm).toBeGreaterThan(m.hipHeightCm);
    }
  });

  it('keeps the ankle below the knee when an entered inseam is very short', () => {
    for (const bodyType of ['womens', 'mens'] as const) {
      const { measurements: m } = estimateBody({ heightCm: 163, weightKg: 68, bodyType, overrides: { inseamCm: 50 } });
      expect(m.ankleHeightCm).toBeLessThan(m.kneeHeightCm);
      expect(m.ankleHeightCm).toBeGreaterThan(0);
    }
  });

  it('stays finite, in its limits and in order across the whole input range', () => {
    for (const bodyType of ['womens', 'mens'] as const)
      for (const heightCm of [120, 160, 230])
        for (const weightKg of [30, 90, 250]) {
          const { measurements: m } = estimateBody({ heightCm, weightKg, bodyType });
          for (const key of LEG_KEYS) {
            expect(Number.isFinite(m[key])).toBe(true);
            const { min, max } = LEG_ESTIMATE_LIMITS[key];
            // The order guard may lift a height past its clamp, never below it.
            expect(m[key]).toBeGreaterThanOrEqual(min);
            if (key !== 'hipHeightCm' && key !== 'waistHeightCm') expect(m[key]).toBeLessThanOrEqual(max);
          }
          expect(m.kneeHeightCm).toBeLessThan(m.inseamCm);
          expect(m.inseamCm).toBeLessThan(m.hipHeightCm);
          expect(m.hipHeightCm).toBeLessThan(m.waistHeightCm);
        }
  });

  it('are estimated', () => {
    const model = estimateBody({ heightCm: 163, weightKg: 68, bodyType: 'womens' });
    for (const key of LEG_KEYS) expect(model.sources[key]).toBe('estimated');
  });
});
