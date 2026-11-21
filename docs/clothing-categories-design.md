# Clothing categories beyond tees — design report

Status: proposal, written 2026-11-19 against `main` @ `0060dee` (after PRs #27–#32). Decisions on the open
questions are at the end (2026-11-20). PR 1a (registry + rules, commits 1–2 of §6) is built; see "PR 1a as built".
PRs 1b–5 and 7 are built too; each has its own "as built" note in §6.
Order asked for: pants/jeans → hoodies/sweaters → skirts/shorts → jackets/coats → dresses → bras → leggings
(the PR plan in §6 puts bras before leggings, as requested for the PRs).

**The rule this design keeps**, in short (the full wording is in [parked-ideas.md](parked-ideas.md)):

> Body proportions come only from the fit engine; drawing is a skin on top.

In practice: every length, height and girth the mannequin uses must be a number that `domain/` produced
(`BodyModel`, `Garment`, or a fit/layer result). `ui/` may shape (curves, folds, mirroring, colour), never
invent a proportion that a fit zone could disagree with. §1.4 lists where today's code breaks this, and PR 1 fixes the
pants-related cases.

---

## 1. Current state: how tee-specific is each part?

| Part | Tee-specific? | In one line |
|---|---|---|
| Garment schema | **Medium** | Bottoms exist, but the measurement set, the definitions and the photo landmarks are a closed, tee-shaped list. |
| `rules.ts` | **Medium–high** | Objective bands are generic in shape; personal fit (`INTENT_EASE`, anchors) is tee chest only; no negative-ease targets. |
| `recommendSize` | **Low in the picker, high in the scoring** | `pickSize` is generic; what feeds it (`personalFit`, miss, keys) switches on `category === 'top'`. |
| Mannequin rendering | **High** | Two hard-coded slots, tee physics in `topShape`, pants drawn partly from invented proportions. |
| Photo warp | **Math generic, mesh tee-only** | The triangle warp works for any mesh; the 13 landmarks and the triangle fan are a tee. |

### 1.1 Garment data schema — `app/src/domain/garments/types.ts`

- `GarmentCategory = 'top' | 'bottom'` (`types.ts:12`) and the eight `GarmentType`s (`types.ts:14`). Both are read
  as switches in about 30 places (`grep "category ==="`): `fitEngine.ts:118`, `sampleFit.ts:139,220,291`,
  `preference.ts:84,263`, `validate.ts:35,87,136`, `verify.ts:221,230,236,246`, `outfit.ts:41–48`,
  `FittingRoom.tsx:75–234`, `fitText.ts:299,342,402`, `LikedTab.tsx:32–60`, `SwipeCard.tsx:94`, `GarmentIcon.tsx:8`.
- `SizeMeasurements` (`types.ts:84`) is a fixed list: chest, waist, hips, length, sleeve, shoulder, inseam, rise.
  It has no **thigh, knee, leg opening, hem sweep, underbust, band, cup, bicep or back length**. `rise` is in
  the seed for 4 pants but no zone reads it.
- Measurement definitions exist only for tops: `LengthDefinition` (`hps | center_back | unknown`, `types.ts:48`)
  and `SleeveDefinition` (`types.ts:40`). Pants have no rise definition (front, back or total) and no thigh
  definition (at the crotch, or 1 in below it).
- `chart.girth` is **one method for the whole chart** (`SeedGarment.chart`, `types.ts:228`). Pants charts often
  print the waist all the way round but the thigh and leg opening flat, so this has to become per measurement.
- `stretch` is **one value for the whole garment** (`types.ts:219`). The Fieldline jogger is `high` because of its
  elastic waist, and that wrongly makes its hips stretchy too.
- `sleeve?: 'short' | 'long'` (`types.ts:218`) is a top field that sits on the shared base.
- `TOP_LANDMARKS` (13 points, `types.ts:148`) are the only landmark set. `validateImage` rejects any non-top
  (`validate.ts:136`).
- `REQUIRED` is per category (`validate.ts:20`): top `chest + length`, bottom `waist + inseam`.
- The generic parts carry over unchanged: `MeasuredValue` and its origin, `MeasurementProvenance`, `SourceTier`, `GarmentAudit`,
  `ConfidenceGrade`, `sizing`, `fitIntent`.

### 1.2 `app/src/domain/fit/rules.ts` (and `fitEngine.ts`)

- `GirthRule` (`rules.ts:21`) is `tightBelow / fittedMax / relaxedMax / ideal` in cm. That's generic in shape,
  but every band is in absolute cm. A leggings rule needs bands as a **fraction of the body**, centred **below zero**.
- Negative ease today only comes in through `STRETCH_ALLOWANCE` (`rules.ts:112`), which lowers the "tight" boundary
  by a fraction of the body (`fitEngine.ts:183`). It can't say "the right fit is −8 %".
- `TOP_CHEST`, `WOMENS_TOP_CHEST` and `TOP_GIRTH_RULES` (`rules.ts:40–78`) are tops by sizing. `BOTTOM_WAIST`,
  `BOTTOM_HIPS` and `INSEAM` (`rules.ts:81–105`) are one set for everyone. There are no rules for rise, thigh or
  leg opening.
- **Personal fit is tee-only.** `INTENT_EASE` (`rules.ts:133`) is "target chest ease for a tee", and the anchor
  constants (`rules.ts:141–147`) are tee chest and tee length.
- `fitEngine.zonesFor` (`fitEngine.ts:117–138`) is a hard-coded `if (category === 'top')`, and
  `ZoneId` (`fitEngine.ts:23`) is a closed union. `unknownReason` (`fitEngine.ts:140`) has tee checks written in
  (length must be `hps`, sleeve must be `shoulder_to_cuff`).
- `overallTone` (`fitEngine.ts:232`) and `labelGirth`/`labelLength`/`bandsFor` are already generic. So is the
  rule "a girth we couldn't check means unknown", which is exactly what new categories need.

### 1.3 `recommendSize` — `app/src/domain/fit/sampleFit.ts`, `preference.ts`

- `pickSize` (`sampleFit.ts:265`) is generic: highest chance of liking it, ties go roomier, null when unscored
  or no girth was scored. **Keep as is.**
- What feeds it is tee-shaped:
  - `GIRTH_KEYS`, `GARMENT_KEYS` and `BODY_KEYS` (`sampleFit.ts:82–92`) are hand-written lists. A new
    measurement such as thigh wouldn't be sampled at all.
  - `idealEaseCm` (`sampleFit.ts:138`) switches on top/bottom.
  - The miss on tops uses the personal chest target (`sampleFit.ts:220`).
  - `measurableFor` (`sampleFit.ts:290`) switches on top/bottom.
- `personalFit` (`preference.ts:262–281`) only personalises a top's chest and length. Every other zone falls back
  to its objective label. `combine` (`preference.ts:284`) is close to generic, but "much roomier" is chest-only.
- The anchor is a tee by definition (`preference.ts:24–35`, `anchorCandidates` at `:84`).

### 1.4 Mannequin rendering — `app/src/ui/components/Mannequin/`

- `Mannequin.tsx:17–24` takes exactly `top?` and `bottom?`. The stored outfit is the same two slots
  (`ui/state/stored.ts:33–38`, `EMPTY_OUTFIT` at `:125`). There is no layer order, no third slot and no one-piece.
- `topShape.ts` is tee physics through and through: `SHORT_SLEEVE_CM`, `DROP_*`, `HANG`, `MAX_SIDE_ROOM_CM` and
  `MAX_SIDE_FLARE_CM` (`topShape.ts:40–64`). It takes `bodyChestCm`, and when the chart can't be trusted it
  draws `bodyChestCm * 1.08` (`topShape.ts:116`).
- `bottomShape` (`geometry.ts:355`) draws from waist, hips and inseam, but:
  - the waistband sits at a fixed `lerp(waist, hip, 0.25)` (`geometry.ts:358`). **The chart's rise is ignored.**
  - the leg opening comes from `HEM_HALF` by garment type (`geometry.ts:344`), **not from the chart**.
  - the knee width is half the hip plus the hem (`geometry.ts:373`), which is invented.
- `bodyGeometry` (`geometry.ts:137`) **breaks the skin rule** for anything below the waist:
  - hip at `0.49 H` and knee at `0.72 H` (`geometry.ts:153–154`), and the waist at `0.385 H` (`geometry.ts:162`)
  - thigh width as half the hip width (`geometry.ts:178–179`)
  - all widths through ellipse factors (`halfWidth`, `geometry.ts:69`)

  That's harmless while no zone scores thigh, knee height or rise. It becomes wrong the moment one does: the
  readout would say "thigh +4 cm" and the drawing would show something else.
- `BodyGeometry.leg` and `arm` are `Limb`-like (top, bottom, half-widths). That's reusable for sleeves, trouser
  legs and leggings alike.

### 1.5 Photo warp — `app/src/ui/components/Mannequin/photoWarp.ts`

- Generic, keep: `triangleAffine`, `applyAffine` and `affineToSvg` (`photoWarp.ts:57–78`), `regionClips` (`:208`),
  `foldedPieces` (`:289`), and the strip idea for limbs (`SLEEVE_STRIPS`, `sleeveTriangles`, `:92–144`).
- Tee-specific: `Corner` names (`:84`), `BODY_RIGHT` fan from the centre line (`:115`),
  `WarpRegion = 'body' | 'sleeveLeft' | 'sleeveRight'` (`:31`), `warpPieces(photo, shape, sleeves)` signature (`:253`),
  and `TOP_LANDMARKS` in the domain.
- Data side: `GarmentImage.landmarks: Record<TopLandmarkName, …>` (`types.ts:184`), `validateImage`
  (`validate.ts:127`), and the `/dev/landmarks` picker (`app/src/dev/landmarks/suggest.ts`), which suggests
  landmarks from a tee outline.

### 1.6 `data:check` — `app/src/domain/garments/verify.ts`, `verifyRules.ts`

- `GIRTH_METHOD_LIMITS` covers chest, waist and hips only (`verifyRules.ts:20`). `TOP_RANGES`,
  `TOP_LENGTH_RANGES` and `BOTTOM_RANGES` (`:27–49`) are keyed by top/bottom.
- `REFERENCE_CHEST_IN` (`:58`) and `CHEST_EASE_BY_INTENT` (`:82`) are the men's/unisex tee chest. `BOTTOM_WAIST_EASE`
  (`:93`) works for pants sized by waist.
- Generic, keep: monotonic order, grading (`GRADING_RATIO`), audit tolerance, and "unscorable when a required
  definition is unknown" (`unscorableZones`, `verify.ts:262`).

---

## 2. Generic category design

### 2.1 Shape of it

A new category is mostly **data in four places**. It doesn't need new branches in the engine:

```
domain/garments/categories/<id>.ts   CategorySpec   measurements, definitions, data:check rules, landmarks
domain/fit/zones/<id>.ts             ZoneSpec[]     which zones, body target, rule per zone, personal zone
domain/fit/rules.ts                  rule tables    per-zone ease bands (cm or fraction), stretch, intent targets
ui/components/Mannequin/templates/<id>.ts  DrawTemplate  outline + warp mesh, from domain numbers only
```

A registry maps each `GarmentType` to one **template** (`TemplateId`). A template says which slot it fills.
`category` stays in the seed, as the slot, so rows still read well; `validate` checks that it matches the type's
template.

```ts
// domain/garments/types.ts
export type TemplateId =
  | 'tee' | 'shirt' | 'knit'            // tops
  | 'pants' | 'shorts' | 'leggings'     // legwear
  | 'skirt' | 'dress'
  | 'jacket'                            // jackets and coats
  | 'bra';

/** Where a garment is worn. Drawing order and outfit slots follow this. */
export type Slot = 'underwear' | 'legwear' | 'bottom' | 'onepiece' | 'top' | 'mid' | 'outer';
export type GarmentCategory = Slot;     // widened; 'top' and 'bottom' keep their meaning

export type GarmentType =
  | 'tee' | 'long-sleeve-tee' | 'polo' | 'button-up'
  | 'hoodie' | 'sweatshirt' | 'sweater' | 'cardigan'
  | 'jeans' | 'chinos' | 'joggers' | 'trousers'
  | 'shorts' | 'skirt'
  | 'jacket' | 'blazer' | 'coat' | 'puffer'
  | 'dress'
  | 'leggings'
  | 'bra';

export const TYPE_TEMPLATE: Record<GarmentType, TemplateId> = {
  tee: 'tee', 'long-sleeve-tee': 'tee', polo: 'tee', 'button-up': 'shirt',
  hoodie: 'knit', sweatshirt: 'knit', sweater: 'knit', cardigan: 'knit',
  jeans: 'pants', chinos: 'pants', joggers: 'pants', trousers: 'pants',
  shorts: 'shorts', skirt: 'skirt',
  jacket: 'jacket', blazer: 'jacket', coat: 'jacket', puffer: 'jacket',
  dress: 'dress', leggings: 'leggings', bra: 'bra',
};
```

### 2.2 Measurements and definitions

```ts
/** Everything a chart can give, any category. Include only what the chart lists. */
export interface SizeMeasurements {
  // girths (full circumference after normalising)
  chest?: number; underbust?: number; waist?: number; hips?: number;
  thigh?: number; knee?: number; legOpening?: number; hemSweep?: number;
  bicep?: number; cuff?: number; hemBand?: number;
  // stretched girths, when a chart prints "relaxed / extended" (waistbands, rib hems)
  waistStretched?: number; hemBandStretched?: number;
  // lengths
  length?: number; sleeve?: number; shoulder?: number;
  inseam?: number; rise?: number; backRise?: number; outseam?: number;
}
export type MeasurementKey = keyof SizeMeasurements;

/** Where a measurement is taken. Unknown is allowed, and a zone that needs it is then unscored. */
export interface Definitions {
  length?: 'hps' | 'center_back' | 'waist' | 'unknown';          // tops, dresses (hps/cb), skirts (waist)
  sleeve?: 'shoulder_to_cuff' | 'center_back_to_cuff' | 'top_of_sleeve' | 'unknown';
  rise?: 'front' | 'back' | 'total' | 'unknown';                 // front = waistband top to crotch seam
  thigh?: 'at_crotch' | 'below_crotch_2_5cm' | 'unknown';
  hips?: 'fullest' | 'below_waist_cm' | 'unknown';               // skirts often: a fixed cm below the waist
  hipsBelowWaistCm?: number;
  waistSeam?: 'natural' | 'empire' | 'drop' | 'none';            // dresses
}

export interface SeedGarment extends GarmentBase {
  chart: {
    unit: 'cm' | 'in';
    /** One method for the whole chart, or per measurement (pants: waist full, thigh flat). */
    girth: GirthMethod | Partial<Record<MeasurementKey, GirthMethod>>;
    definitions?: Definitions;          // replaces lengthDefinition / sleeveDefinition (migrated in normalize)
  };
  /** Garment default, plus per-zone overrides (a jogger: { waist: 'high' }, the rest 'none'). */
  stretch: Stretch | { default: Stretch } & Partial<Record<MeasurementKey, Stretch>>;
  /** Fabric bulk, for layering (§3). Default by template. */
  weight?: 'light' | 'mid' | 'heavy';
  sizes: SeedSize[];
}
```

`normalizeGarment` already records each conversion in its provenance. It gains a per-key girth method and maps the
old `lengthDefinition`/`sleeveDefinition` fields into `definitions`. The old names stay readable in the seed, so
`seed.json` doesn't need a rewrite.

### 2.3 Zones and per-zone ease (negative ease, stretch)

```ts
// domain/fit/zones.ts
export type ZoneId =
  | 'chest' | 'underbust' | 'waist' | 'hips' | 'thigh' | 'knee' | 'calf' | 'legOpening' | 'hemBand'
  | 'shoulder' | 'bicep'
  | 'length' | 'sleeve' | 'inseam' | 'rise'
  | 'band' | 'cup';

/** girth: ease = garment − body · length: garment − target · landing: where it ends (descriptive). */
export type ZoneKind = 'girth' | 'length' | 'landing';

export interface ZoneSpec {
  zone: ZoneId;
  kind: ZoneKind;
  garmentKey: MeasurementKey;
  /** The body number to compare with. A function when the target is derived (girth at the waistband's height). */
  body: BodyKey | ((b: BodyMeasurements, g: Garment, s: SizeMeasurements) => number);
  rule: RuleRef;                      // looked up in rules.ts by template + zone (+ sizing)
  /** A required zone that can't be scored makes the size "unknown" (today's girth rule, made explicit). */
  required: boolean;
  /** When this zone applies at all. Long sleeves only, chart lists it, etc. */
  applies?: (g: Garment, s: SizeMeasurements) => boolean;
  /** The definition this zone needs, and which values it accepts. */
  needs?: { definition: keyof Definitions; accepts: readonly string[] };
}

export interface TemplateZones {
  template: TemplateId;
  zones: ZoneSpec[];
  /** The girth that carries the personal preference (tee: chest). null = objective only (pants for now). */
  personalZone: ZoneId | null;
  /** Body measurements the user can type in that change this template's result (measurementHint). */
  measurable: BodyKey[];
}
```

`fitEngine.zonesFor` becomes `TEMPLATE_ZONES[TYPE_TEMPLATE[g.type]].zones.filter(z => z.applies?.(g, s) ?? true)`.
`unknownReason` reads `needs` instead of naming length and sleeve. `sampleFit`'s key lists come from the zones of
the garment's template. `measurableFor` becomes `measurable`.

**Rules.** One rule type covers today's bands, negative ease and stretch:

```ts
// domain/fit/rules.ts
export interface EaseRule {
  kind: 'girth';
  /** 'cm' as today; 'fraction' = a share of the body measurement (−0.08 = 8 % smaller than the body). */
  scale: 'cm' | 'fraction';
  tightBelow: number;   // may be negative: leggings −0.18
  fittedMax: number;    // may be negative: leggings −0.02
  relaxedMax: number;
  ideal: number;        // may be negative: leggings −0.08
  /** How much stretch moves "tight" down, per Stretch level. Defaults to STRETCH_ALLOWANCE. */
  stretch?: Partial<Record<Stretch, number>>;
}
export interface LengthRule { kind: 'length'; shortBelow: number; longAbove: number; ideal: number }
/** Descriptive only: never makes a size good or bad, so overallTone and pickSize skip it. */
export interface LandingRule { kind: 'landing'; marks: { label: string; atCm: number }[] }

export type Stretch = 'none' | 'some' | 'high' | 'compression';
export const STRETCH_ALLOWANCE: Record<Stretch, number> = { none: 0, some: 0.04, high: 0.2, compression: 0.35 };

/** Every rule, by template and zone; a zone may vary by garment sizing (as TOP_GIRTH_RULES does today). */
export const RULES: { [T in TemplateId]?: Partial<Record<ZoneId, Rule | Record<GarmentSizing, Rule>>> };
```

How labelling works:
- `labelGirth` works on `ease = garment − body` (cm scale) or on `ease / body` (fraction scale).
- Stretch lowers `tightBelow` by `allowance × body`, as today, but the allowance is per zone.
- When a chart prints a stretched value (`waistStretched`), it **replaces** the heuristic: tight means
  `waistStretched < body`. The provenance shows which one was used.
- Labels stay `tight / fitted / relaxed / loose`. `fitText.ts` picks the wording per template, so on leggings
  "loose" reads "baggy" and "tight" reads "too much squeeze".

**Personal fit.** `INTENT_EASE` becomes `INTENT_EASE[template][intent]` for the template's `personalZone`. Tee
numbers stay as approved. Pants, skirts and bras stay objective until there's a "pants you like" anchor; that's
not in this plan. `combine` reads `personalZone` instead of `'chest'`.

**Landing zones** are new and matter for shorts, skirts, dresses and coats. A hem isn't right or wrong, it lands
somewhere: "ends 6 cm above your knee", "mid-thigh", "covers the hip". They show in the readout, but `overallTone`
and `pickSize` ignore them, the same way `recommendSize` already never picks on length alone. The body landmarks
they need (knee height, hip line, navel height) come from the body model (§5), never from the drawing.

### 2.4 Drawing / warp template (ui)

```ts
// ui/components/Mannequin/templates/types.ts
export interface Envelope {            // what the garment drapes over: the body, or the layer under it (§3)
  halfAt(y: number): number;           // right-side half-width at height y
  arm: Limb; leg: Limb;
}
export interface DrawInput {
  g: BodyGeometry;                     // from BodyMeasurements only
  body: BodyMeasurements;
  garment: Garment;
  size: GarmentSize;
  under: Envelope;                     // body envelope, or the one from the layer below
  layerBulkCm: number;                 // from domain/fit/layers.ts — the same number the fit used
}
export interface DrawnGarment {
  regions: { id: string; d: string }[];          // 'body', 'sleeveLeft', 'legRight', 'cupLeft'…
  overlays: { arms?: [string, string]; folds: string[]; strain: string[] };
  markers: Partial<Record<ZoneId, Marker>>;
  landmarks: Record<string, Pt>;                  // the template's landmark names, drawn position
  limbEdges: Record<string, SleeveEdges>;         // sleeves and legs, for strip warps
  envelope: Envelope;                             // for the next layer up
  approximate: boolean;
}
export interface DrawTemplate {
  id: TemplateId;
  draw(input: DrawInput): DrawnGarment;
  mesh: WarpMesh;                                 // triangles over landmark names + limb strips
}
export interface WarpMesh {
  regions: { id: string; triangles: [string, string, string][]; strips?: { limb: string; count: number } }[];
}
```

- `topShape` becomes the `tee` template unchanged. `shirt` and `knit` reuse it with different constants
  (a sweater's `HANG` is lower; a rib hem gathers in).
- `bottomShape` becomes the `pants` template and reads rise, thigh, knee and leg opening from the chart.
  `HEM_HALF` stays only as the fallback when the chart lacks a leg opening, and that sets `approximate` (dashed),
  exactly like a top with an unverified girth.
- Landmark **names** live in the domain (`categories/<id>.ts`), because the seed stores them and `validateImage`
  checks them. Triangles live in the ui template. `warpPieces(photoLm, drawn, mesh)` loops over `mesh.regions`;
  the tee mesh is today's `BODY_RIGHT` and the sleeve strips. Pants reuse the sleeve strip code for each leg
  (`legOuterLeft`/`legInnerLeft` edges are the same idea as a sleeve's outer and inner edges).

Pants landmarks, proposed: `waistLeft, waistRight, waistMid, hipLeft, hipRight, crotch, kneeOuterLeft,
kneeInnerLeft, kneeOuterRight, kneeInnerRight, hemOuterLeft, hemInnerLeft, hemOuterRight, hemInnerRight`
(14 points; the knee points are optional and the strips interpolate without them).

**Skin-rule fixes in the drawing (PR 1):**
- `bodyGeometry`'s waist, hip, knee and crotch heights come from new body measurements (`waistHeightCm`,
  `hipHeightCm`, `kneeHeightCm`, plus `inseamCm`, which is already there).
- Thigh and knee widths come from `thighCm` and `kneeCm`, through `halfWidth`.
- The pants waistband sits where the **engine** says it sits (§2.6), not at `lerp(..., 0.25)`.
- `halfWidth` ellipse factors can stay as skin: they turn an engine circumference into a front width and don't
  decide fit. (ANSUR II women's front breadths give C/3.5 at the chest, C/2.9 at the waist, C/2.9 at the hips;
  today's factors are C/2.7, C/2.8 and C/2.75. A later "true widths" change could take them from the survey.)

### 2.5 `data:check` rules per category

```ts
// domain/garments/categories/types.ts
export interface CategoryChecks {
  /** Without these the garment says nothing useful (today's REQUIRED). */
  required: MeasurementKey[];
  /** Definitions a required zone needs; unknown → grade "unscored" (today's lengthDefinition rule). */
  requiredDefinitions: (keyof Definitions)[];
  /** Plausible values, cm, full circumference. Warnings. */
  ranges: Partial<Record<MeasurementKey, Range>>;
  /** Printed flat above flatMax / full below circumferenceMin → error (today's GIRTH_METHOD_LIMITS, per key). */
  girthMethod: Partial<Record<MeasurementKey, { flatMax: number; circumferenceMin: number }>>;
  /** Within one size: thigh < hips / 2 + 8, legOpening ≤ knee ≤ thigh, waist ≤ hips … Warnings. */
  relations: { message: string; holds: (m: SizeMeasurements) => boolean }[];
  /** Ease against a typical body for the size label (today's chest table and BOTTOM_WAIST_EASE). */
  labelEase?: (label: string, m: SizeMeasurements, g: SeedGarment) => string | null;
  /** Grading runs: which keys must grow size to size, and how sizes group (pants: one run per inseam). */
  monotonic: MeasurementKey[];
}
export interface CategorySpec {
  template: TemplateId;
  slot: Slot;
  landmarks: readonly string[];
  checks: CategoryChecks;
}
```

`checkGarment` loops over `spec.checks` instead of switching on top and bottom. Errors and warnings keep their
meaning, so the grade and the report don't change.

### 2.6 What this means for pants (PR 1)

| Zone | Kind | Garment | Body target | Starting rule (assumed, tune with Test mode) |
|---|---|---|---|---|
| waist | girth | `waist` (or `waistStretched`) | body girth **at the waistband's height**, between `waistCm` and `hipsCm` | `BOTTOM_WAIST` as today |
| hips | girth | `hips` | `hipsCm` | `BOTTOM_HIPS` as today |
| thigh | girth | `thigh` (needs `definitions.thigh`) | `thighCm` | tight < −1 cm − stretch; fitted ≤ 5; relaxed ≤ 10; ideal 3 |
| rise | landing + check | `rise` (front) | `frontRiseCm`, navel height | marks: low / mid / high rise; warn if the band lands below the hip line |
| inseam | length | `inseam` | `inseamCm` | `INSEAM` as today |
| legOpening | landing + check | `legOpening` | `calfCm`, `heelAnkleCm` | marks: skinny / slim / straight / wide; **bad** when it won't pass the heel (no stretch, no zip) |

Where the band sits: `bandHeight = crotchHeight + 0.71 × frontRise`. In ANSUR II women, navel height − crotch
height is 19.8 cm vertical, against a front crotch length of 27.9 cm along the body, so 0.71 is that ratio. Men's
needs the same check on the male file. This one function is what lets the rise change the waist result: a
low-rise jean's "waist" gets compared to the body where it actually sits. The drawing reads the same function,
so pin and picture agree.

---

## 3. Layering: a jacket over a top

### 3.1 Fit

Size charts and the ease bands are **bare-body** numbers. Brands grade a jacket assuming something light
underneath. So the outer template states what it assumes, and we only add the bulk *beyond* that:

```ts
// domain/fit/layers.ts
export const LAYER_BULK_CM: Record<'light' | 'mid' | 'heavy', number> = {   // circumference added, assumed
  light: 0.5,    // tee, shirt        (2π × ~0.8 mm)
  mid: 2,        // sweatshirt, knit  (2π × ~3 mm)
  heavy: 3.5,    // heavy hoodie, fleece
};
/** Share of an under-layer's spare ease (beyond fitted) that still takes room once compressed. Assumed. */
export const UNDER_EASE_KEPT = 0.25;

export interface WornLayer { garment: Garment; sizeLabel: string; slot: Slot }

/** The body an outer layer sees, zone by zone: the body plus the layers under it, minus what the template assumes. */
export function effectiveBody(body: BodyModel, under: WornLayer[], outer: Garment): BodyModel;

export interface OutfitFit {
  layers: { garmentId: string; fit: GarmentFit }[];
  /** "The hoodie shows below the jacket", "The sweater bunches under the sleeves". Never changes a label. */
  notes: LayerNote[];
}
export function fitOutfit(body: BodyModel, worn: WornLayer[]): OutfitFit;
```

- `jacket` assumes a `light` layer underneath. A hoodie under it adds `heavy − light = 3 cm` to the chest,
  plus `UNDER_EASE_KEPT ×` the hoodie's ease beyond fitted. The chest and bicep zones use that effective body.
  Lengths and the shoulder use the bare body.
- **Size cards stay bare-body.** `recommendSize` for a jacket on its own uses the template's assumption. Only the
  fitting room, with an actual layer under it, uses `fitOutfit`, and the readout says "with your hoodie under it".
- `sampleFit` keeps one body draw per sample, shared by every layer. That way an estimated chest moves the hoodie
  and the jacket together, just as an anchor tee shares it today.
- Layer notes are checks, not labels:
  - under-layer hem lands below the outer hem (landing zones of both)
  - under-layer sleeve longer than the outer sleeve
  - under-layer chest ease above the outer's effective ease ("bunches")

### 3.2 Drawing

- The Mannequin takes `worn: WornGarment[]` and sorts by slot: `underwear → legwear → bottom → onepiece →
  top → mid → outer`. Tops draw over bottoms, untucked, as today.
- Each template's `draw` gets `under: Envelope`: the body for the first layer, then the previous layer's
  `envelope`, grown by `layerBulkCm / 2π` per side. `topShape` already uses `bodyHalfAt` and `g.half.chest`;
  those become `under.halfAt` and the envelope's half at chest height. The jacket then hangs off the hoodie,
  not the body.
- `layerBulkCm` comes from `domain/fit/layers.ts`, the same number `effectiveBody` used. That keeps the skin rule.
- Arms: today the arm is drawn again over the shirt below a short sleeve (`TopShape.arms`). With an outer layer,
  each layer's sleeve is clipped by the sleeve above it, and only the outermost layer draws the arm overlay.
- An under-layer hem that lands lower than the outer hem stays visible below it, because it was drawn first.
  Nothing extra is needed.
- An open jacket (`closure: 'open'`, a drawing option) draws two front panels, with the layer under it visible
  between them. Closed comes first; open can wait.
- Storage: `outfit` → `choudo.outfit.v2` = `{ [slot]: { id, size } | null }`. `migrate.ts` maps v1's
  `topId/topSize/bottomId/bottomSize` to `top` and `bottom`. Saved outfits (`outfits`) migrate the same way.
  A dress fills `onepiece` and clears `top` and `bottom`; putting a top on clears `onepiece`.

---

## 4. Bras: beside the zone engine, sharing its parts

### 4.1 Why not plain zones

A bra size is two numbers about the **body**: the band is the underbust, and the cup is bust minus underbust.
Brands publish body ranges per size, almost never garment measurements. So a bra chart is source tier **F
(body-size chart only)**, and its grade stays **estimated**: the grading order already does this
(`grade.ts`, `WEAK_TIERS`). The design keeps one exception open: if a brand spec gives the band's relaxed length
and its stretch (tier A), the band becomes an ordinary negative-ease girth zone (fraction scale, ideal around −10 %).
No new mechanism is needed.

So bras get their own small module that returns the **same `GarmentFit`/`ZoneFit` shape**. The readout, sampler,
`pickSize`, verdicts and grade all work unchanged:

```ts
// domain/fit/bra.ts
export type BraSystem = 'us' | 'uk' | 'eu' | 'fr' | 'au';

/** A bra size as numbers: band index and cup index, plus the system it was printed in. */
export interface BraSizeIndex { system: BraSystem; band: number; cup: number }   // cup: AA = 0, A = 1 …

/** A bra size row from a body-size chart: what body each size is for. Seed values stay "estimated". */
export interface BraChartSize {
  label: string;                        // "34D", "75D"
  underbustCm: Range;                   // from the chart, or from the system's convention (origin "estimated")
  bustCm: Range;
}

/** Zones: band (underbust vs. the size's range) and cup (bust − underbust vs. the size's cup range). */
export function fitBra(body: BodyModel, garment: Garment & { bra: { system: BraSystem; sizes: BraChartSize[] } }, sizeLabel: string): GarmentFit;

export function convertBraSize(size: BraSizeIndex, to: BraSystem): BraSizeIndex;
export function sisterSizes(size: BraSizeIndex): { down: BraSizeIndex; up: BraSizeIndex };
```

- **band**: `ZoneFit` kind girth, bands relative to the size's underbust range. Below the range reads "tight
  band"; above reads "band rides up" (in a bra, loose is the common failure).
- **cup**: bust − underbust against the cup's range. Under reads "cups too small"; over reads "cups gap".
- The **personal anchor** for bras is the bra the user wears now plus one answer: fits / band rides up / band
  digs in / cups gap / cups spill. That's the same idea as the anchor tee. The answer moves one step along band or
  cup, and sister sizes (below) give the alternatives.
- `body.bra` already exists (`BodyModel.bra`, `braSize.ts`). It estimates the bust as band + cup inches. For a
  bra fit, the bra size alone **cannot** give the underbust: a "34" band is a 34 in underbust under the modern
  (+0) convention, but about 30 in under the traditional "+4" one. So underbust must be measured, or set from
  the user's current bra plus the brand convention, with its spread widened (§5).

### 4.2 Conversion and sister sizes

Bands. US and UK bands are inches; EU uses underbust cm in 5 cm steps; FR/ES/BE add 15 to EU; AU/NZ subtract 22
from UK.

| US / UK | 28 | 30 | 32 | 34 | 36 | 38 | 40 | 42 | 44 |
|---|---|---|---|---|---|---|---|---|---|
| EU | 60 | 65 | 70 | 75 | 80 | 85 | 90 | 95 | 100 |
| FR / ES | 75 | 80 | 85 | 90 | 95 | 100 | 105 | 110 | 115 |
| AU / NZ | 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20 | 22 |

Cups by index. This is how brands' international tables convert. The UK and US columns are already in
`braSize.ts` `CUP_INCHES`; EU, FR and AU are new:

| index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| US | AA | A | B | C | D | DD (E) | DDD (F) | G | H | I | J | K | L |
| UK, AU | AA | A | B | C | D | DD | E | F | FF | G | GG | H | HH |
| EU, FR | AA | A | B | C | D | E | F | G | H | I | J | K | L |

- US and UK cups step 1 in (2.54 cm); EU cups step 2 cm (EN 13402: A is about 12–14 cm bust − underbust). So
  the index match drifts by about 0.5 cm per step. By index 8 (UK FF / EU H) the true cup difference is about
  4 cm apart. `convertBraSize` converts by index, as retailers do, and the converted size gets a wider spread
  (`BRA_CONVERT_SD_CM_PER_STEP`, new in `uncertainty.ts`). Always prefer the brand's own chart in its own system.
- **Sister sizes** keep the cup volume and move the band: one band down, one cup up, and the reverse.
  US/UK 34C ↔ 32D ↔ 36B; EU 75C ↔ 70D ↔ 80B. `sisterSizes` is band ± 1 step and cup ∓ 1 index. It's only
  offered when the cup answer is "fits" and the band answer isn't.
- Check these tables against a real brand chart (Panache/Freya publish international tables) when seeding.
  They're common retailer tables, not a standard.

### 4.3 Drawing

Two cups and a band over the bust region. The cups are drawn from `chestCm`, `underbustCm` and the bust
height (`chestHeight`, §5). Without a bra photo mesh, it's a flat colour. Bras get no photo warp in their PR,
and `validateImage` keeps rejecting them.

---

## 5. Women's body data: what's needed, and does ANSUR II cover it?

I checked against the ANSUR II female public CSV (1,986 women; the copy the women's-sizing session downloaded,
still in its scratchpad). These are ordinary least squares on height and weight, the same method as
`WOMENS_REGRESSION`. Columns are ANSUR's names.

| Needed for | Measurement | ANSUR II column | R² | residual SD | Verdict |
|---|---|---|---|---|---|
| bras, empire-waist dresses | **underbust** | — (not in the public file) | — | — | **Not covered.** Tape (new optional override), or from the current bra + brand convention with a wide spread. Never from height and weight alone. |
| pants, shorts, leggings | thigh | `thighcircumference` | 0.83 | 2.3 cm | Good |
| skinny jeans, leggings | knee (just above) | `lowerthighcircumference` | 0.71 | 1.9 cm | Good |
| leggings, leg opening | calf | `calfcircumference` | 0.65 | 1.7 cm | Usable |
| leg opening must pass the foot | heel–ankle | `heelanklecircumference` | 0.59 | 1.0 cm | Usable (small SD) |
| leggings hem | ankle | `anklecircumference` | 0.37 | 1.2 cm | Weak R², small SD: usable with its spread |
| pants rise | front crotch length | `crotchlengthomphalion − crotchlengthposterioromphalion` | 0.30 | 2.5 cm | **Weak**: needs its own wide spread, and the "rise" line in the body form |
| pants rise (total) | crotch length | `crotchlengthomphalion` | 0.39 | 3.3 cm | Weak |
| waistband height, landing | navel (waist) height | `waistheightomphalion` | 0.84 | 2.0 cm | Good |
| inseam (have it) | crotch height | `crotchheight` | 0.73 | 2.3 cm | Good (already used) |
| hip line, hem landing | hip height | `trochanterionheight` / `buttockheight` | 0.74 / 0.71 | 2.3 / 2.5 cm | Good |
| skirts, dresses, shorts landing | knee height | `kneeheightmidpatella` | 0.71 | 1.4 cm | Good |
| CB lengths (Uniqlo-style charts) | back neck height | `cervicaleheight` | 0.97 | 1.1 cm | Very good: makes `center_back` length scoreable |
| tops, jackets | shoulder height | `acromialheight` | 0.95 | 1.3 cm | Very good (replaces `torsoLength = 0.41 H`) |
| knits, raglan sleeves | **CB-to-wrist sleeve** | `sleevelengthspinewrist` | 0.70 | 2.1 cm | Good: makes `center_back_to_cuff` scoreable |
| long sleeves | shoulder to wrist | `sleeveoutseam` | 0.63 | 1.8 cm | Usable (replaces `0.35 H`) |
| jackets | shoulder width | `biacromialbreadth` | 0.35 | 1.5 cm | Weak R², small SD: usable with its spread |
| jacket and knit sleeves | bicep | `bicepscircumferenceflexed` | 0.79 | 1.4 cm | Good, but **flexed**: reads high for a relaxed arm; take about 1 cm off (assumption) |
| dress bodice, bra drawing | bust height | `chestheight` | 0.84 | 2.2 cm | Good |
| hoodies, collared shirts | neck base | `neckcircumferencebase` | 0.53 | 1.3 cm | Usable |
| one-pieces (later) | vertical trunk | `verticaltrunkcircumferenceusa` | 0.75 | 3.8 cm | Good, out of scope |

Notes:
- ANSUR II's waist is at the navel. That's where a mid-rise band sits. A "natural waist" (narrowest), which
  dresses and high-rise skirts use, isn't in the file. Treat it as navel waist with its own spread, or let the
  user enter it.
- `crotchheight / stature` averages **0.480** for women, the same number the women's-sizing hand-over found. The
  men's `inseam: 0.45` ratio is probably low. PR 1 should fit men's on the **ANSUR II male** file: download it to
  the scratchpad only, the same way, and use the same columns. The men's power law has no thigh, rise or heights.
- **Men's leg re-fit as built (2026-11-21).** The leg keys are now regressions on the ANSUR II male file
  (4,082 men; `MENS_LEG_REGRESSION`), the same columns and method as the women's. R² / residual SD: thigh
  0.85 / 2.26, knee 0.78 / 1.49, calf 0.71 / 1.61, heel–ankle 0.62 / 1.02, front rise 0.42 / 2.65, navel
  height 0.84 / 2.07, hip height (`buttockheight`) 0.68 / 2.81, knee height 0.69 / 1.55, ankle height 0.25 /
  0.49. `RISE_VERTICAL_RATIO.mens` checks out at 0.79 on the file. The biggest change is the front rise of
  tall, lean men (190 / 80: 28.9 → 24.9 cm), which raises the band. Not re-fitted yet: the men's inseam
  (`0.45 × height`) and the power-law girths, which would move men's tops.
- Every new estimated key gets an entry in `ESTIMATED_BODY_SD_CM[bodyType]` (`uncertainty.ts:33`) from its
  residual SD, and `measurementHint` can name it ("measure your thigh").
- New overrides worth a field on the body screen: underbust (bras, PR 6), thigh (pants, PR 1, optional), and
  natural waist (dresses, optional). Every one is optional, as today.
- Remember ANSUR II is a military population: fitter, younger, BMI 16–41. Keep the clamps in `INPUT_LIMITS`.

---

## 6. PR plan

Each PR passes `npm run check`, adds seed rows by hand per `docs/adding-garments.md` (no scraping; the Uniqlo
terms note still applies), extends Test mode so its assumed thresholds can be tuned, and updates CLAUDE.md.

| # | PR | Size | What's in it |
|---|---|---|---|
| 1 | **Generic categories + pants** | **L** | Template/zone/category registry; per-key girth method and stretch; `EaseRule` (cm or fraction); landing zones; pants zones waist (at band height), hips, rise, thigh, inseam, leg opening; new body keys; drawing and warp for pants |
| 2 | Hoodies / sweaters | M | `knit` template on the tee drawing; CB sleeve and CB length now scoreable; rib hem/cuff stretch; `weight` field |
| 3 | Skirts / shorts | M | `shorts` (pants template, inseam as landing); `skirt` template (waist, hips at a defined drop, hem landing, walking room) |
| 4 | Jackets / coats | L | `jacket` template (chest, shoulder, sleeve, bicep, length landing); layering engine; outfit v2 slots + migration; layer stack in the Mannequin |
| 5 | Dresses | L | `onepiece` slot; bust, waist (by seam), hips, length landing; joined top + skirt drawing and mesh |
| 6 | Bras (on hold) | M | `bra.ts` beside the zone engine; underbust input; EU/FR/AU + sister sizes; current-bra anchor; simple drawing |
| 7 | Leggings | S | `leggings` template: fraction-scale negative ease, `compression` stretch, skin-tight drawing on the pants mesh |

### PR 1 — generic design + pants (Large)

Commit order:
1. **Registry with no behaviour change.** `TYPE_TEMPLATE`, `CategorySpec`, `TemplateZones` for `tee`, `shirt`
   and `pants`, reproducing today's `zonesFor`. `sampleFit` key lists and `measurableFor` read from the
   template. Before touching anything, add a golden test: `fitAllSizes` + `sampleFit` for every seed garment on
   a few bodies, byte-equal before and after.
2. **Rules.** `EaseRule` with `scale`; `STRETCH_ALLOWANCE` per zone; `chart.girth` per key; `definitions`
   (old `lengthDefinition`/`sleeveDefinition` still read). Landing zones (`kind: 'landing'`) skipped by
   `overallTone`/`pickSize`.
3. **Body.** `thighCm`, `kneeCm`, `calfCm`, `heelAnkleCm`, `frontRiseCm`, `waistHeightCm`, `hipHeightCm`,
   `kneeHeightCm` for both body types. Women's from the female file. Men's new keys need an estimate too, but
   the men's ANSUR II re-fit is its own later PR (decision 3): until then men's new keys come from the
   existing men's model (ratios of height, labelled assumed), and nothing men's already has moves. Each key
   gets its spread in `uncertainty.ts`.
4. **Pants zones** (§2.6), including `bandHeight()` and the body girth at the band.
5. **`data:check`.** Pants `CategoryChecks`: thigh and leg-opening girth-method limits, relations
   (`legOpening ≤ knee ≤ thigh`, `thigh < hips / 2 + 8`), rise/thigh definitions required for those zones.
   Grade the existing 6 bottoms: those without a thigh, opening or rise definition stay charted, with those
   zones unknown and not required.
6. **Drawing.** `bodyGeometry` heights and leg widths from the new keys (the skin-rule fix). The `pants` template
   draws the band at `bandHeight()`, with thigh, knee and opening from the chart, and `HEM_HALF` only as a dashed
   fallback.
7. **Photo warp.** Pants landmarks and leg strips; `validateImage` per category; the `/dev/landmarks` picker and
   `suggest.ts` handle a pants outline; `npm run photos` unchanged.
8. **UI wording.** `zoneName` (Thigh, Rise, Leg opening), landing phrases ("sits 2 cm below your navel"); Test
   mode records bottoms (waist / thigh / length answers).

Split into 1a (commits 1–2, Medium, no visible change) and 1b (3–8).

#### PR 1a as built

- **Golden test first**: `domain/fit/golden.test.ts` writes `fitAllSizes`, `personalFit`, `sampleFit` and
  `measurementHint` for every catalogue garment (plus the unknown-chest test tee) on six bodies and four
  preferences, and `normalizeGarment` + `checkGarment` for every seed row, one JSON line per garment under
  `domain/fit/__golden__/`. It stayed byte-identical through both commits, and so did `npm run data:check`.
- **Registry**: `domain/garments/categories.ts` (`TYPE_TEMPLATE`, `CategorySpec` with the data rules) and
  `domain/fit/zones.ts` (`TemplateZones`: zones, rule per zone or per sizing, `needs` for definitions,
  `personal` zones). Templates today: `tee`, `shirt`, `pants`.
- **One change from §2.3**: the sampler draws *every* schema key (`MEASUREMENT_KEYS`,
  `BODY_MEASUREMENT_KEYS`) in a fixed order, not the template's keys. Drawing only the template's keys would
  change the seeded draws for every garment; drawing them all means a new measurement is sampled without
  touching `sampleFit.ts`. New keys go at the end of those lists.
- **Rules**: `GirthRule.scale` (`cm` | `fraction`) rather than a new `EaseRule` type, so today's rules stay as
  written; `girthRuleInCm` turns fraction bounds into cm per body. `GirthRule.stretch` overrides the
  allowance per zone; a garment's `stretch` may be `{ default, <key>: level }`; new level `compression`
  (0.35, assumed). `chart.girth` may be `{ default, <girth>: method }`. `chart.definitions` holds length,
  sleeve, rise, thigh (hips and waist-seam definitions come with skirts and dresses). Landing zones have the
  label `noted` and a `landing` mark.
- Also new: `validateGarment` rejects an unknown type, and a category that isn't the type's template's.

#### PR 1b-1 as built (pants fit)

- **Sampler streams**: the main random stream is frozen to the 7 body and 8 garment keys it drew
  before; every key added since draws from its own stream (`keyedSeed(seed, key)`). Tops stayed
  byte-identical in the golden test through the whole PR.
- **Body keys**: thigh, knee, calf, heel–ankle, front rise, navel / hip-line / knee heights.
  Women's from the ANSUR II female file (coefficients in `WOMENS_LEG_REGRESSION`, spreads in
  `uncertainty.ts`). Men's are assumed ratios of the ANSUR II male means; thigh, knee and calf ride
  on the men's hips estimate rather than height, so they grow with weight (replaced by the men's
  ANSUR II re-fit, §5). The hip line is
  `buttockheight` (where the seat girth is measured).
- **Band height** is anchored at the navel, not the crotch:
  `waistHeight − RISE_VERTICAL_RATIO × (bodyFrontRise − garmentRise)`; at the survey mean this is
  §2.6's `crotchHeight + 0.71 × rise`, and it uses the body's own front rise. Ratio 0.71 women's,
  0.79 men's (male means, assumed).
- **Engine**: `ZoneSpec.bodyTarget`, `ZoneSpec.optional`, `LandingRule.blocks`. Blocked landings
  reuse existing labels (`tight` → "too tight", `short` → "shorter"), so no new verdict.
- **Checks**: relations are `legOpening ≤ knee ≤ thigh` and `thigh ≤ 0.7 × hips` (not §2.5's
  `hips / 2 + 8`, which flags ordinary relaxed jeans once both are full circumferences).
- **Test mode** records bottoms (waist, thigh when scored, inseam); records are v3.
- **Known effect, not changed**: body and garment errors are drawn independently per key, so each
  extra girth zone adds its own chance of "too tight". Pants (waist, hips, thigh) lean towards
  "too tight" in the odds on estimated data more than a single-girth tee does (men 176/85, Corvo
  Slim Jean 36x32: too-tight 0.42 against fits 0.11, though every zone fits at the point
  estimate). Drawing thigh with hips alone only helps partly (the men's thigh SD of 4 cm against a
  tight boundary of about −3.5 cm makes the thigh tight on its own about 1 draw in 5); the fix is to
  correlate the leg girths with the body's waist / hips draw (ANSUR residual correlations), or
  narrow the men's thigh spread. A follow-up, before real pants data lands.
- **Readout**: a waist worked out at the band says so ("You 84.1 cm where the waistband sits",
  estimated), and landing zones' odds give only the chance they block ("Won't go on 4%").

#### PR 1b-2 as built (pants drawing)

- **Body geometry** (skin-rule fix): `y.waist / hip / crotch / knee` are the body model's navel,
  hip-line, crotch and knee heights. Leg widths are its thigh, knee and calf through
  `halfWidth.leg = C / 6.75` (a flattened-ellipse front width; C/2π made two thighs wider than the
  hips), with the drawn thigh capped so the thighs fill the hips side by side.
- **Pants template** `ui/components/Mannequin/templates/pants.ts` (`pantsShape`, replacing
  `bottomShape`): band at `bandHeight()`, widths from the chart, `HEM_HALF` and a +2 cm thigh/knee
  only as dashed fallbacks. It also returns the drawn landmarks, each leg's edges (for strips)
  and each leg's outline (so a leg's photo is clipped to that leg).
- **Warp**: `warpPantsPieces` beside the tee's `warpPieces` (sharing the strip and clip code). The
  tee path is unchanged, pinned by snapshot tests taken before the change.
- **Landmarks**: 14 required points (§2.4's list; the knees are required, not optional). The
  picker picks a kit by template; `suggestPantsLandmarks` reads the outline row by row. Tested on a
  synthetic jeans outline and a synthetic PNG (not committed); no real pants photo yet.

#### PR 2 as built (knits)

- **Template** `knit` (hoodie, sweatshirt, sweater, cardigan), category `top`. Zones chest, length,
  sleeve, hemBand (optional). No new body keys: centre-back targets are worked out from existing
  ones in `domain/fit/tops.ts` (`bodyTarget` + `bodyAt: 'centre_back'`), so the sampler and every
  existing golden line are unchanged.
- **Centre back**: length target = torso − `BACK_NECK_DROP_CM` (2, assumed). Sleeve target = arm +
  shoulder / 2 + `SHOULDER_CURVE_CM` — checked against ANSUR II `sleevelengthspinewrist`: our arm +
  half shoulders runs 5.3 cm (men) / 5.5 cm (women) short of the survey means at their statures, so
  that is the correction (not a regression; one per body type).
- **Knit offset** `KNIT_EASE_OFFSET_CM` = 10 (assumed: Gildan 18500 vs 5000, 4 in fuller per size)
  moves the chest bands and the personal target; knits aren't anchors.
- **Hem band** (`hemBand`, relaxed) vs hips, `HEM_BAND` assumed (tight < −2 cm before stretch,
  fitted ≤ +4, relaxed ≤ +12). The design's `hemBandStretched` isn't built: no chart prints it.
- **Weight** `weight?: light | mid | heavy` with a per-template default (`weightOf`); unused until PR 4.
- **Checks**: knit ranges, per-definition sleeve ranges (tops unchanged), a knit flat-chest limit
  (95 cm; a 5XL hoodie is 86), relation `hemBand ≤ chest`, `scoredDefinitions` per template.
- **Data**: Gildan 18500 and Comfort Colors 1566 from the brands' spec sheets on SanMar (tier B).
  Neither prints a hem band: estimated at 85 % of the chest (assumed), so both grade `estimated`.
  The 1566 chart has no sleeve.
- **Drawing**: `topShape` + rib hem band, rib cuffs, hood (behind the neck) and drawcords;
  `hoodTop` landmark is validated and drawn but not yet warped (no knit photos).
- **Known effect**: a knit's best "fits how you like" odds run lower than a tee's (men 176/85:
  Gildan L 13 % vs a tee's 27 %) — the sleeve adds a length zone and the estimated hem band widens
  the garment spread. Not tuned.

#### PR 3 as built (skirts / shorts)

- **Templates** `shorts` and `skirt`, both category `bottom`. No new body keys, so every existing
  golden line is unchanged (two garments add 14 lines).
- **Shorts** = the pants zones without the leg opening (pants measure it against the heel), the
  inseam a landing against crotch-to-knee (`SHORTS_INSEAM`: mid-thigh, above knee from −12 cm,
  knee from −4 cm; assumed from 5–7 / 9 / 11 in inseams on a ~30 cm crotch-to-knee).
- **Skirt** (`domain/fit/skirt.ts`): band = navel − `SKIRT_BAND_DROP_CM` (natural 0, mid 4, low 8;
  assumed, matching the pants rise marks; no definition → navel, as pants without a rise). Hips at
  `chart.hipsBelowWaist` (chart unit, a garment-level field rather than a definition, since it's a
  number) or the fullest hips. Length (`definitions.length: 'waist'`) lands against band − knee
  height (`SKIRT_LENGTH`: mini < −15, above knee, knee ±5, midi from +5, maxi from +28; assumed).
- **Walking room**: the hem must go round both legs a stride apart. Two leg sections of girth c
  with centres D apart measure c + 2D round; side to side D = c / π (legs touching), front to back
  2 · d · sin(20°) at d below the crotch (`STRIDE_ANGLE_DEG` 40, assumed from gait: ~30° flexion +
  ~10° extension). Leg girth runs thigh → knee girth, then the calf. A landing zone whose
  `restricted` mark carries `tone: 'warn'` (new on `LandingRule` marks): it shows a warning and,
  like every landing, never decides the size. No slit/vent field yet, so a vented pencil skirt
  warns too.
- **Checks**: `SHORTS_RANGES`, `SKIRT_RANGES`, `waist ≤ hips`, `legOpening ≤ thigh`, hem-sweep
  flat/round limits, `CategorySpec.lengthDefinitions` (tops hps / center_back / unknown, skirts
  waist / unknown), hip point 5–30 cm and above each hem.
- **Data**: Lands' End item-dimension PDFs (tier B, as the Super-T): Women's Solid A-line Skirt
  Below the Knee 430808 (Regular 0–16; waist `mid` from the retailer's "midrise") and Men's 5½"
  Lightweight Twill Easy Shorts 552171 (relaxed elastic waist, stretch high; front rise; bottom
  opening = leg opening; no thigh, so drawn dashed). Both grade charted.
- **Drawing**: `templates/skirt.ts` (band, hip point, hem from `skirt.ts`; widths from the chart).
  `pantsShape` now ends the hem the inseam below the body's crotch, where the fit puts it (it was
  2 cm lower), and only needs a knee girth on a leg that reaches the knee.
- **Not built**: skirt/shorts photo landmarks and warp (no photos); `waistStretched` for elastic
  waists — a relaxed elastic waist reads "fitted" well under the body on stretch alone (Easy Shorts M
  on a men's 176/85: −12.7 cm), so smaller sizes look right more often than they should.

#### PR 4 as built (jackets / coats + layering)

- **Template** `jacket` (jacket, coat), category **`outer`** (a third outfit slot, not §2.1's full
  `Slot` list). The layer under a jacket is whatever is in `top`; no `mid` slot yet.
- **Zones**: chest and a charted waist (`layered`), shoulder (optional, girth-kind `JACKET_SHOULDER`
  ±1.5 cm fitted, so a narrow shoulder reads "too tight" with no new verdict), sleeve (as knits),
  length a landing against the hip line (`JACKET_LENGTH`: cropped / hip / thigh / knee-length / calf;
  "knee-length", not "knee", because landing wording is keyed by mark and skirts use "knee").
  `JACKET_EASE_OFFSET_CM` 13 (J317: 17.8 cm over its size chart's chest vs a regular tee's +5).
  **No bicep zone**: no chart we have prints one and the body has no bicep key (needs the ANSUR fit).
- **Layering** as §3.1 (`LAYER_BULK_CM`, `UNDER_EASE_KEPT`, the jacket assumes light). Built as
  `fitGarment(body, g, size, under)` rather than an `effectiveBody()` BodyModel: layered zones add
  `layerAllowanceCm` and say `bodyAt: 'over_layer'`; the fit carries `over`. `fitOutfit` and its
  notes live in `domain/fit/outfit.ts` (layers.ts is imported by the engine, so not there). The
  "bunches" note fires on any excess; hem and cuff notes need more than 1 cm.
- **Sampler**: `SampleOptions.under`; the layer is worked out from each sample's body draw, the top's
  offsets come from their own streams after every existing draw, so bare odds and every golden line
  are unchanged (two jackets add 14 lines).
- **Storage**: §3.2's outfit v2, kept flat (`outerId`, `outerSize` beside the top and bottom) rather
  than a `{ [slot]: … }` map; `outfits` v2 the same. The jacket slot is never filled by default.
- **Drawing**: §3.2's envelope as a `BodyGeometry` (`envelopeGeometry`), so `topShape` is unchanged
  and hangs the jacket off the top's drawn outline + bulk / 2π. Closed only (placket, stand collar).
  The Mannequin takes `outer` as a third prop rather than `worn[]`.
- **Data**: Port Authority J317 (men's) and L317 (women's) soft shells from SanMar's spec sheets
  (tier B, chest flat, length HPS at the back, sleeve centre back; no shoulder). L317's 3XL→4XL
  length step is uneven as printed (one grading warning). Both grade charted.
- **Test mode**: a jacket asks chest and sleeve (its length only lands), records `wornOver`, CSV
  column `worn_over` last.
- **Not built**: bicep; a `mid` slot (tee + hoodie + jacket); open jackets; jacket photo landmarks
  and warp; under-layer sleeve clipping beyond draw order (a longer cuff shows, as the note says).

#### PR 5 as built (dresses)

- **Template** `dress` (type `dress`), category **`onepiece`**. Zones, in order: bust (required,
  `DRESS_GIRTH_RULES` = `TOP_CHEST` −1 / +2 / +4 in for every sizing, assumed: Lands' End's sheath
  is cut 4 in over its own body chest, which the women's tee bands would call loose), shoulder
  (optional, `JACKET_SHOULDER`, when charted), sleeve (as knits), waist (optional, when charted;
  the tee waist band, at the navel, scored only for `definitions.waistSeam` `natural` or `none`;
  empire, drop and unknown say why), hips (optional, when charted, `BOTTOM_HIPS`, the fullest),
  length (the skirt marks, against HPS → mid-knee, `bodyAt: 'shoulder_knee'`; a centre-back length
  is moved by `BACK_NECK_DROP_CM`), walking room (as skirts, at the dress's hem).
  **Objective only** (`personal: null`), as bottoms: the verdict says "fits well".
- **Heights** in `domain/fit/dress.ts`: seam = navel for every seam (the drawing's join; scoring
  is the zone's call), hem = HPS height − HPS length, `hpsToKneeCm`. The HPS height moved into
  domain as `HPS_BELOW_TOP_RATIO` 0.165 (the mannequin's own, assumed; between ANSUR II acromial
  and cervicale heights), so no drawing moved. Lengths hang straight (no bust drape).
- **Outfit v3** (flat, as v2): `onepieceId/onepieceSize`. A dress empties top and bottom; a top or
  bottom takes it off (the other slot refills by default). A jacket goes over the dress
  (`fitOutfit({ onepiece, outer })`, the dress as `under`; no hem-shows note). Fitting room tabs
  Top / Bottom / Dress / Jacket (Dress only when one is on show or worn; it opens there when a
  dress is worn).
- **Drawing**: `templates/dress.ts`. `topShape` gained `hemAt` (end the bodice at the seam, at the
  chart waist's width), `skirtShape`'s outline is `skirtOutline` (band width from the bodice).
  Order bodice → skirt → arms → sleeves, so the skirt's top edge reads as the seam. `asUnder`
  carries the side seam down the skirt for a jacket. Snapshots guard every tee/shirt and skirt.
- **Data**: Lands' End item-dimension PDFs, tier B, Regular sizes: Washable Wool Piped Sheath
  505999 (bust, waist, hip, CB length, sweep; waistband piping → `natural`; 6% spandex → `some`;
  pencil, so walking room warns on small sizes) and Pattern Knit Shirred Surplice 441021 (bust,
  HPS length, sweep; product page not found: stretch `some` from "knit", seam `unknown`).
- **Test mode**: a dress asks bust, waist (when scored) and length; report rows count as tops and
  bottoms.
- **Not built**: sleeveless dresses (`topShape` always draws sleeves); empire waists (need an
  underbust, PR 6); drop waists; a slit/vent field; dress photo landmarks and warp.

#### PR 7 as built (leggings)

- **Template** `leggings` (type `leggings`), category **`bottom`**, not §2.1's `legwear` slot: nothing can
  be worn over them yet. Zones, in order: waist (the pants waist at the band), hips (required), thigh
  (optional, needs `definitions.thigh`), calf (optional, new garment key `calf`, last in
  `MEASUREMENT_KEYS`), length. **No knee zone** (the brief asked for waist, hips, thigh and calf).
  Objective only.
- **Rules** (all assumed, fraction scale, per-zone stretch through `GirthRule.stretch`):
  `LEGGINGS_GIRTH` (hips, thigh, calf) ideal −8 %, fitted to −2 %, relaxed to +3 %, tight below
  −5 % less the allowance (compression 0.13 → −18 %, high 0.08 → −13 %, some 0.04). `LEGGINGS_WAIST`
  ideal −8 %, fitted to 0, relaxed to +4 %, tight below −8 % (compression 0.08 → −16 %). The first
  waist rule (band ≈ body) called a 163 / 68 body's SanMar M "tight": Sport-Tek cuts its relaxed
  band at its chart's *natural* waist in every size, and ANSUR II's navel waist runs about 8 % larger.
  Re-derived from the chart; tune with Test mode.
- **Length** is a landing against crotch → ankle bone (`bodyAt: 'ankle'`): capri, 7/8 from −16 cm,
  ankle from −5, `stacked` (tone warn, "Long") from +4. Never decides the size.
- **Body**: `ankleHeightCm`, women's ANSUR II `lateralmalleolusheight` regression (R² 0.19, SD
  0.46 cm, n 1,986), men's 0.0415 × height (male means), assumed; kept 25 cm under the knee. The
  golden files' body header lines gained the key; every garment line was unchanged.
- **Recommendation** without hips: `pickSize` still suggests by the waist (the girths it can score),
  as it already does for pants with no hips. So LPST890 reads "can't check" with a suggested size.
- **Data**: SanMar spec pages, tier B, snapshots saved locally: Sport-Tek LPST890 7/8 Legging (waist
  flat, 25 in inseam; no hip, so unknown) and LPST880 NRG Fitness Pant (named a pant by SanMar, but
  spandex and cut ≈ 15 % under the body: typed leggings; its hip row has no method, read as flat like
  the waist). No stretch data on either: `compression` with the new `stretchAssumed: true`.
- **Drawing**: `templates/leggings.ts` on the pants outline and warp points: body leg + 0.2 cm, the
  chart's width only where bigger, hem at `leggingsHemHeight()`, stopped and `pooled` at the ankle when
  longer. `y.ankle` is now the body's ankle height (was 0.955 H); no existing snapshot moved.
- **Wording**: "Too much squeeze" / "Baggy", the share under the body ("8.0 cm (8 %) smaller than your
  hips: snug, as leggings are cut."), "7/8 length: ends 8.5 cm above your ankle bone.", "Stretch
  assumed" on the source line.
- **Not built**: a knee zone; a `legwear` slot; leggings photo landmarks and warp; Test mode asks
  waist, thigh and length only (not hips or calf).

### PR 2 — hoodies / sweaters (Medium)
- `knit` zones: chest (personal, tee `INTENT_EASE` plus a knit offset), length (`hps` or `center_back` against
  `cervicaleHeightCm`), sleeve (`shoulder_to_cuff` or `center_back_to_cuff` against `sleevelengthspinewrist`),
  and `hemBand` (rib: `hemBandStretched` or stretch `high`).
- `weight` field (default `mid`), ready for layering.
- Drawing: the `tee` template with knit constants (stiffer drape, gathered rib hem and cuffs, hood shape for
  hoodies), and the tee mesh plus an optional `hoodTop` landmark.
- Checks: knit ranges, rib relations (`hemBand ≤ chest`).
- Worn in the `top` slot only until PR 4.

### PR 3 — skirts / shorts (Medium)
- `shorts` = the pants template. Its inseam is a landing zone (marks: mid-thigh, above knee, knee), measured from
  the body's crotch height. Waist, hips, thigh and rise are as pants.
- `skirt` template: waist at band height (rise-like `definitions.waist`: natural / mid / low), hips at
  `definitions.hipsBelowWaistCm`, length landing from the waist (mini / above knee / knee / midi / maxi against
  `kneeHeightCm`), and a walking-room check (`hemSweep` against a stride girth from `thighCm` and knee height;
  assumed, warn only).
- Drawing: an A-line from `hemSweep`, or a pencil skirt. The warp mesh is waist, hip and hem corners, with no
  limbs.
- Skirts go in the `bottom` slot.

### PR 4 — jackets / coats (Large)
- `jacket` zones: chest and waist over `effectiveBody`, **shoulder scored** (the seam on the shoulder point,
  ±1.5 cm; assumed), sleeve (both definitions), bicep, and length landing (hip / mid-thigh / knee / calf for
  coats).
- `domain/fit/layers.ts` (§3), `fitOutfit`, and layer notes.
- Outfit `v2` slots + `migrate.ts`, Fitting room "Outer" picker, closet/saved outfits.
- Mannequin `worn[]`, envelopes, and clipping of sleeves and arm overlays. Drawn closed first.
- Photo warp: the tee mesh plus lapel/collar points, optional.

### PR 5 — dresses (Large)
- `onepiece` slot; a dress replaces top + bottom.
- Zones: bust (personal), waist **at the seam** (`definitions.waistSeam`: natural → navel waist with a wider
  spread or the entered natural waist; empire → underbust, unscored until PR 6; none → unscored); hips required
  unless the silhouette is fit-and-flare or A-line (then a landing note); length landing from HPS against knee
  height; shoulder/straps optional.
- Drawing: the tee template's bodice joined to the skirt template at the seam height from the engine. The mesh
  joins both.

### PR 6 — bras (Medium) — on hold until a brand gives garment specs
- `domain/fit/bra.ts` (§4), `BraChartSize` seed shape (tier F → estimated), band/cup zones in `GarmentFit`.
- Underbust override on the body screen; `ESTIMATED_BODY_SD_CM` for an underbust from a bra size, wide.
- `braSize.ts` gains EU/FR/AU, `convertBraSize` and `sisterSizes`. Tests cover the tables in §4.2 as fixtures.
- Current-bra anchor with the five answers. Simple cup drawing; no photo warp.
- Slot `underwear`, drawn under every other layer.

### PR 7 — leggings (Small)
- `leggings` = pants zones with `EaseRule` fraction scale: waist, hips, thigh, knee and calf, with ideal around
  −8 % and tight below about −18 %. All assumed; tune with fit tests.
- `compression` stretch. Inseam is a length zone (full) or a landing zone (7/8, capri).
- Drawing follows `under` (the body) plus 0.2 cm, with no folds. Reuses the pants mesh.
- Slot `legwear`, so shorts or a skirt can go over them.

---

## Decisions (2026-11-20)

1. New thresholds ship labelled **"assumed"**, as `WOMENS_TOP_CHEST` was: thigh, rise landing marks,
   leggings fractions, layer bulk, shoulder tolerance, and `compression` stretch.
2. A pants rise makes a size bad **only when the band lands below the hip line**. Otherwise it only moves
   where the waist is measured, and says where the band sits.
3. The **men's ANSUR II re-fit** (thigh, rise, heights, possibly inseam 0.45 → 0.47) is a **separate later
   PR**, not in 1a or 1b.
4. **Bras (PR 6) are on hold** until a brand gives garment specs. §4 stays as the design for then.
5. Storage keys are `choudo.*` since the rename (PR #33); §3.2 says `choudo.outfit.v2`.
6. The skin rule's full wording is in [parked-ideas.md](parked-ideas.md).
