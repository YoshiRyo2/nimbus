# Men's leg keys from ANSUR II: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the men's assumed leg ratios (`MENS_LEG_RATIO`) with least-squares fits on height and weight over the ANSUR II male public file, done the same way as `WOMENS_LEG_REGRESSION`. Also replace the men's assumed leg spreads with the fitted residual SDs.

**Architecture:** One new table, `MENS_LEG_REGRESSION: Record<LegKey, LinearFit>`, in `domain/body/estimateBody.ts`. `mensLegs(heightCm, weightKg)` becomes the same `linear(...)` call that `womensLegs` uses, and the two functions merge into one `legsFrom(table, h, w)`. `ESTIMATED_BODY_SD_CM.mens` takes the residual SDs, rounded by the women's rule. Nothing else in the engine changes. The golden files are regenerated on purpose, and the diff is turned into a per-garment table for the PR.

**Tech Stack:** TypeScript, Vitest. Python 3 runs the one-off fit in the scratchpad only.

**Spec:** the user's brief in chat, plus `docs/clothing-categories-design.md` §5 (columns and method) and the PR 1b-1 note "Men's are assumed ratios of the ANSUR II male means".

## Global Constraints

- Source: `https://tools.openlab.psu.edu/publicData/ANSUR_II_MALE_Public.csv`, downloaded 2026-11-21 (4,082 men; sha1 `d2f72e3c…`, the same file earlier sessions used). It lives in the scratchpad only. **Never commit the CSV or the fit script.**
- Committed numbers: the coefficients (`estimateBody.ts`) and the residual SDs (`uncertainty.ts`), each cited with its ANSUR column, R² and residual SD.
- Method: ordinary least squares, `y = intercept + perCm·H + perKg·W`, H in cm and W in kg (ANSUR's mm and kg×10 divided by 10); residual SD over n − 3. The same columns as the women's keys.
- Men's results are meant to change. **Women's golden lines and men's tops** (category `top`: tees, shirts, knits) must stay byte-identical. Men's body header lines change, because they print the leg keys.
- Regenerate the golden files with `npx vitest run src/domain/fit/golden.test.ts -u` and review the diff.
- Don't commit `node_modules`, `.models/` or any cache folder. Cloud setup: `npm ci --ignore-scripts`, then `npm rebuild esbuild`.
- Done when `npm run check` exits 0 (locally, then in the cloud CI on the PR).

## The fit (already run, 2026-11-21)

| key | ANSUR II column | intercept | perCm | perKg | R² | SD | old (assumed) |
|---|---|---|---|---|---|---|---|
| thighCm | `thighcircumference` | 59.4745 | −0.1836 | 0.4125 | 0.85 | 2.26 | 0.61 × hips, SD 4 |
| kneeCm | `lowerthighcircumference` | 34.4190 | −0.0658 | 0.2112 | 0.78 | 1.49 | 0.40 × hips, SD 3 |
| calfCm | `calfcircumference` | 35.0962 | −0.0684 | 0.1888 | 0.71 | 1.61 | 0.385 × hips, SD 3 |
| heelAnkleCm | `heelanklecircumference` | 12.1699 | 0.0966 | 0.0609 | 0.62 | 1.02 | 0.196 × H, SD 2 |
| frontRiseCm | `crotchlengthomphalion − crotchlengthposterioromphalion` | 21.5141 | −0.0539 | 0.1707 | 0.42 | 2.65 | 0.152 × H, SD 3.5 |
| waistHeightCm | `waistheightomphalion` | −20.4370 | 0.7448 | −0.0551 | 0.84 | 2.07 | 0.601 × H, SD 3 |
| hipHeightCm | `buttockheight` | −18.1947 | 0.6169 | −0.0158 | 0.68 | 2.81 | 0.505 × H, SD 3 |
| kneeHeightCm | `kneeheightmidpatella` | −11.3032 | 0.3430 | −0.0011 | 0.69 | 1.55 | 0.278 × H, SD 2.5 |
| ankleHeightCm | `lateralmalleolusheight` | 1.1731 | 0.0310 | 0.0079 | 0.25 | 0.49 | 0.0415 × H, SD 1.2 |

Spreads use the women's rule: the residual SD + 0.5 cm, rounded up to the next half cm. That gives thigh 3, knee 2, calf 2.5, heel–ankle 2, front rise 3.5, navel height 3, hip height 3.5, knee height 2.5 and ankle height 1.

`RISE_VERTICAL_RATIO.mens`: (mean `waistheightomphalion` − mean `crotchheight`) / mean front rise = **0.79** on this file, so the value stays the same. Only its comment changes, from "assumed" to "from the ANSUR II male file".

**Decision for you (default in bold):** heel–ankle wasn't in your list. It's the same kind of assumed ratio, though, so I've **included it**. Say if you'd rather it stayed as it is.

**Out of scope:** the men's inseam (`ratio.inseam 0.45`; §5 says it's probably low), chest, waist, hips, torso, arm and shoulder. Changing any of these would move men's tops. Listed as a follow-up.

## Review Focus

1. **Extreme inputs (120–230 cm, 30–250 kg):** a straight line can run outside the survey there. The `LEG_ESTIMATE_LIMITS` clamps and `orderHeights` must still hold for men's bodies. The existing "stays finite, in its limits and in order" test covers this, so it must pass unchanged.
2. **An entered men's hips override:** the girths used to ride on the *estimated* hips. They now come from height and weight. An entered hips value never moved them before and still doesn't. This gets a test in Task 1.
3. **Men's tops lines must stay byte-identical:** no top zone reads a leg key. Task 2 checks this mechanically, line by line, for category `top`.
4. **Jackets on a men's body:** the length landing is measured against `hipHeightCm`, so jacket lines may move. They're reported, not blocked.
5. **The sampler:** the leg keys draw from their own streams (`keyedSeed`). A narrower SD changes only bottoms, jackets and dresses on men's bodies, never the main stream.

---

### Task 1: Men's leg keys from the ANSUR II regression

**Files:**
- Modify: `app/src/domain/body/estimateBody.ts`
  - Replace `MENS_LEG_RATIO` with `MENS_LEG_REGRESSION`, using the table above with a cited doc comment like the women's.
  - Merge `womensLegs` and `mensLegs` into `legsFrom(fit: Record<LegKey, LinearFit>, heightCm, weightKg)`.
  - Update the header comment and the `RISE_VERTICAL_RATIO` comment.
- Modify: `app/src/domain/fit/uncertainty.ts`: `ESTIMATED_BODY_SD_CM.mens` leg entries as above, with a comment citing the residuals and the rule.
- Test: `app/src/domain/body/estimateBody.test.ts`

**Interfaces:**
- Produces: `export const MENS_LEG_REGRESSION: Record<LegKey, LinearFit>`, with `MENS_LEG_RATIO` removed. `estimateBody` keeps its signature.

- [ ] **Step 1: Write the failing tests.** Replace the test "men's leg keys are assumed ratios" with these:

```ts
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
  expect(m.ankleHeightCm).toBeCloseTo(7.30, 1);
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
```

Also extend "come after the original keys" with `expect(Object.keys(MENS_LEG_REGRESSION).sort()).toEqual([...LEG_KEYS].sort())`. Keep "men's existing keys don't move" as it is.

- [ ] **Step 2: Run the tests and see them fail.** Run `npx vitest run src/domain/body/estimateBody.test.ts`. Expected: FAIL, because `MENS_LEG_REGRESSION` isn't exported and thigh reads 62.83, not 62.22.
- [ ] **Step 3: Implement.** Add the table and `legsFrom`, and set the SDs in `uncertainty.ts`.
- [ ] **Step 4: Run the tests and see them pass.** `npx vitest run src/domain/body` passes. `npx tsc --noEmit -p .` is clean.
- [ ] **Step 5: Don't commit yet.** The golden test now fails by design, and Task 2 finishes the commit.

### Task 2: Regenerate the golden files and check what moved

**Files:**
- Modify: `app/src/domain/fit/__golden__/fit-mens-*.json` (regenerated)
- Scratch only: a node script in the scratchpad that compares the old and new golden lines

- [ ] **Step 1: See the golden test fail.** Run `npx vitest run src/domain/fit/golden.test.ts`. Expected: FAIL on the three men's files only.
- [ ] **Step 2: Regenerate.** Run `npx vitest run src/domain/fit/golden.test.ts -u`.
- [ ] **Step 3: Check the files that must not change.** `git diff --stat` must show the three `fit-mens-*` files only, with `fit-womens-*` and `garments.json` untouched. For each men's file, the scratch script parses the old (`git show HEAD:…`) and new lines and prints:
  - **(a)** every changed line with category `top`. This must be empty; anything printed is a stop-and-investigate.
  - **(b)** for every other changed garment × body: per size, the point-estimate overall label and zone labels, old → new.
  - **(c)** the `recommendSize` result, old → new.
  - **(d)** the top verdict and its odds, old → new.
  - **(e)** the body keys that drive it.
- [ ] **Step 4: Find the cause of every line in (b).** Each changed line must trace to a moved leg key (for example, "thigh 4 → 3 cm SD narrows the too-tight odds") or a moved landing. Anything that can't be traced is a stop-and-investigate.
- [ ] **Step 5: Run the gate.** `npm run check` exits 0.
- [ ] **Step 6: Commit.** One commit holds Task 1 and Task 2: `Body: men's leg keys from ANSUR II male regressions (was assumed ratios)`.

### Task 3: Docs and the PR

**Files:** `CLAUDE.md` (Body estimates bullet "Leg keys …" and the `estimateBody` description in Layout), and `docs/clothing-categories-design.md` (a short "Men's leg re-fit as built" note under §5, with the table above).

- [ ] **Step 1: Edit both docs.** Men's leg keys become "ANSUR II male regressions (`MENS_LEG_REGRESSION`)". Drop "assumed" for the men's ankle and rise ratio.
- [ ] **Step 2: Run the gate and commit.** `npm run check` exits 0. Commit: `Docs: men's leg keys from ANSUR II`.
- [ ] **Step 3: Push and open the PR.** The description holds:
  - the fit table
  - the **list of every men's garment × body whose result changed: old vs new verdict and why**, from Task 2
  - a statement that women's and men's tops lines are byte-identical
  - the follow-up: men's inseam and girth re-fit
- [ ] **Step 4: Run the cloud recipe on a clean copy.** There's no CI workflow on pull requests: `deploy-pages.yml` runs only on a push to `main`. So, before pushing, run the cloud recipe on a fresh `git clone` of the branch in the scratchpad: `npm ci --ignore-scripts && npm rebuild esbuild && npm run check`. It must exit 0. It runs again in CI when the PR merges.
