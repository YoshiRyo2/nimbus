/**
 * Every spread the fit sampler assumes, in one place. Each is one standard
 * deviation in cm unless it says otherwise. These are reasoned guesses, approved
 * for phase 3 — replace them with numbers from the 10-person fit test
 * (`npm run fit:report`) as soon as there are any.
 */

import type { BodyType, MeasurementKey } from '../body';
import type { ConfidenceGrade } from '../garments';

/** Draws per sampleFit call. At 500 a 50% chance is good to about ±2.2 points. */
export const SAMPLE_COUNT = 500;

/** Fixed seed, so the same inputs always give the same percentages (and tests are stable). */
export const SAMPLER_SEED = 20261118;

/**
 * Body measurements estimated from height and weight (estimateBody), by body type.
 * Men's (reasoned, approved for phase 3):
 *  - chest 5: predicting chest from height + weight in ANSUR-style survey data is
 *    off by about 4 cm (1 SD); our power-law model is cruder, so rounded up. Approximate.
 *  - waist 6: waist moves most with BMI, so it's the hardest girth to guess.
 *  - hips 4: hips track weight more closely than waist does.
 *  - torso length 3, inseam 3: body proportions (sitting-height ratio) vary by
 *    about 1.5% of height, ≈ 2.7 cm on a 178 cm adult.
 *  - arm 2.5, shoulder width 2: same reasoning, shorter segments.
 * Women's: bust, waist, hips and inseam are the residual SDs of the ANSUR II female
 * regressions (4.3, 4.9, 3.0, 2.3 cm; see WOMENS_REGRESSION in body/estimateBody.ts),
 * each rounded up by half a cm because ANSUR II is a military population, not a
 * shopping one. Arm 2.5 as for men (its ratio is from ANSUR II too). Torso length and
 * shoulder width are estimated, not sourced, so they get 1 cm more than men's.
 *
 * Leg keys (pants). Women's: the ANSUR II residual SDs (WOMENS_LEG_REGRESSION in
 * body/estimateBody.ts: thigh 2.28, knee 1.91, calf 1.70, heel–ankle 0.98, front
 * rise 2.47, navel height 2.01, hip height 2.47, knee height 1.40 cm), with the
 * same rule: add half a cm, round up to the next half. Men's: the ANSUR II male
 * residual SDs (MENS_LEG_REGRESSION: thigh 2.26, knee 1.49, calf 1.61, heel–ankle
 * 1.02, front rise 2.65, navel height 2.07, hip height 2.81, knee height 1.55,
 * ankle height 0.49 cm), by the same rule.
 */
export const ESTIMATED_BODY_SD_CM: Record<BodyType, Record<MeasurementKey, number>> = {
  mens: {
    chestCm: 5,
    waistCm: 6,
    hipsCm: 4,
    inseamCm: 3,
    torsoLengthCm: 3,
    armLengthCm: 2.5,
    shoulderWidthCm: 2,
    thighCm: 3,
    kneeCm: 2,
    calfCm: 2.5,
    heelAnkleCm: 2,
    frontRiseCm: 3.5,
    waistHeightCm: 3,
    hipHeightCm: 3.5,
    kneeHeightCm: 2.5,
    ankleHeightCm: 1,
  },
  womens: {
    chestCm: 5,
    waistCm: 5.5,
    hipsCm: 3.5,
    inseamCm: 3,
    torsoLengthCm: 4,
    armLengthCm: 2.5,
    shoulderWidthCm: 3,
    thighCm: 3,
    kneeCm: 2.5,
    calfCm: 2.5,
    heelAnkleCm: 1.5,
    frontRiseCm: 3,
    waistHeightCm: 3,
    hipHeightCm: 3,
    kneeHeightCm: 2,
    // ANSUR II residual 0.46 cm, rounded up as the other leg heights are.
    ankleHeightCm: 1,
  },
};

/**
 * A bust estimated from a bra size (band + cup inches). Assumed: the band can be a
 * size off (±1 in) and the cup a letter off (±1 in) — brands and fitting advice
 * disagree by about that much — so √(2.54² + 2.54²) ≈ 3.6, rounded to 3.5. Wider
 * than a measured bust (ENTERED_BODY_SD_CM), a little narrower than height + weight.
 */
export const BRA_BUST_SD_CM = 3.5;

/**
 * ASSUMPTION, not scored as fact: a fuller bust uses up front length, so a top can
 * sit shorter at the front than its chart length (measured from the shoulder) says.
 * We don't know by how much, so we don't move the length; we only widen the torso
 * length spread by this much (cm, 1 SD) for each cup inch above C (3 in). A DDD (US)
 * adds 1.5 cm in quadrature. Replace with fit-test data when there is some.
 */
export const CUP_TORSO_SD_CM_PER_IN = 0.5;

/** Cups up to and including C (3 in) add nothing to the torso length spread. */
export const CUP_TORSO_FREE_IN = 3;

/**
 * A measurement the user typed in. Measuring yourself with a tape is repeatable
 * to about 1–2 cm (survey measurers allow ~1–2 cm between each other; doing it
 * on yourself is a little worse).
 */
export const ENTERED_BODY_SD_CM = 1.5;

/**
 * How far one real garment can differ from its chart, by confidence grade.
 *  - verified: a usual factory tolerance of ±½ in on a flat width (±2.5 cm round)
 *    and ±½ in on length, read as ±2 SD.
 *  - charted: adds the chance the chart itself is off (copying, reproductions, old charts).
 *  - estimated: some numbers are ours — about half a size step.
 * "unscored" garments use the charted spread for whatever can still be scored.
 * A value whose own origin is "estimated" uses the estimated spread; "audited" the verified one.
 */
export const GARMENT_SD_CM: Record<Exclude<ConfidenceGrade, 'unscored'>, { girth: number; length: number }> = {
  verified: { girth: 1.3, length: 0.7 },
  charted: { girth: 2.5, length: 1.5 },
  estimated: { girth: 5, length: 3 },
};

/**
 * A tee the user measured laid flat: about 1 cm on the flat width (so 2 cm round)
 * and 1 cm on length — a soft tape on a rumpled tee.
 */
export const MEASURED_ANCHOR_SD_CM = { girth: 2, length: 1 };

/**
 * How sure we are of what the user likes, on top of the numbers above.
 *  - style 3: "Regular" means different things to different people.
 *  - anchor 1.5 (chest and length): they own the tee, but a favourite tee is still
 *    a range ("this one, or a touch roomier"), not a point.
 */
export const PREFERENCE_SD_CM = { style: 3, anchorChest: 1.5, anchorLength: 1.5 };

/** For the "measure your X" hint: we re-run the answer at these percentiles (z = ±1.2816). */
export const HINT_Z = 1.2816;
