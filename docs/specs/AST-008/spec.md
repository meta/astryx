---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-008
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-08
phase: accepted
owners: [cixzhang, rubyycheung, imdreamrunner]
affects_architecture:
  [architecture:theme-authoring-contract, architecture:theme-compilation]
affects_families: []
affects_contributing: []
affects_consumer_docs: [color, theme]
---

# Authoring-time tonal palette generation system spec

## Intent

Theme authors need a repeatable way to make complete tonal palette candidates.
Generation is authoring work: it produces colors for people to inspect, adjust,
and accept. The accepted result is saved as private, theme-owned palette data.
Ordinary theme builds do not rerun the generator.

The Palette Generator Lab compares candidate recipes, complete families, modes,
anchors, and existing themes, then lets an author copy candidate JSON. The
versioned OKLCH recipe is the visual basis for supported generation. A later
current authority—AST-018 only if amended and accepted—owns the shape and
lifecycle of accepted palette data and any first-class palette/theme integration.

The Astryx CLI theme-authoring workflow exposes the pure
`generateTonalPalette()` authoring API and the
`astryx theme palette generate` command. Both use one versioned engine. Neither
implicitly rewrites a theme.

New-authoring interfaces recommend the palette workflow and do not present the
legacy color-scale helper as though choosing one accent were an isolated edit or
an approved palette. The Playground omits its `Create from accent` affordance
while retaining explicit token editing.

`DefineThemeInput.color`, `ThemeAdaptationValue.color`, and
`expandColorScale()` are legacy authoring surfaces. They remain `stable` until a
replacement-first patch ships the complete modernization route described below;
that patch moves them to `deprecated`. Their existing runtime behavior remains
supported and byte-equivalent throughout the deprecation window. Deprecation is
static and source-level: declarations, authoring validation, and documentation
identify the replacement, with no compatibility flag, runtime branch,
rendered-app warning, or added executable production-bundle bytes. Static
TypeScript declaration metadata is not executable runtime behavior.

## Non-goals

- Choose the public API, accepted data shape, semantic-role reference model,
  compiler integration, or runtime projection for a future first-class palette.
  A later current authority—AST-018 only if amended and accepted—owns those choices.
- Remove `DefineThemeInput.color`, `ThemeAdaptationValue.color`, or
  `expandColorScale()` before their separately identified cleanup items are
  approved for a minor release.
- Add a runtime compatibility setting, runtime warning, executable production
  branch, or executable production-bundle bytes solely for deprecation.
- Require generated palettes or provenance for hand-authored or imported data.
- Treat a palette stop as design approval or an accessibility guarantee.

## Ownership

| Owner                           | Contract                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| AST-008                         | Candidate generation, the new-authoring recommendation, and the three legacy color-scale deprecation lifecycles.                 |
| Ruby                            | The visual recipe and recommendation, after the required comparison evidence.                                                    |
| Later current palette authority | Accepted palette shape, stable semantic-role references, validation, and any first-class authoring or compilation integration.   |
| `theme:<name>`                  | Accepted exact palette values, mappings and deviations, required states, compatibility, and rendered evidence.                   |
| Current theme architecture      | Productive `defineTheme` normalization and compilation, including byte-equivalent legacy behavior during the deprecation window. |
| CLI authoring surface           | The generation command, pure API, candidate serialization, receipts, safe writes, migration tooling, and authoring diagnostics.  |

## Authoring lifecycle

| Stage      | Required result                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Create     | Generate, hand-author, or import a complete candidate palette.                                                                    |
| Review     | Inspect complete families, modes, diagnostics, comparisons, and rendered contexts; adjust or reject freely.                       |
| Accept     | Save the final exact palette data under the accepted palette contract.                                                            |
| Map        | Record an inspectable, stable semantic-role mapping under the authority that owns accepted palette/theme integration.             |
| Verify     | Record contextual evidence for the exact palette, role mapping, and rendered values in the owning theme record.                   |
| Regenerate | Update mapped roles coherently from the accepted palette without an implicit generator run or a manual recopy of unrelated roles. |

## Requirements

- **FR1 — Generation is optional.** Generated, hand-authored, and imported
  palettes are equal after validation. Missing generation provenance means only
  “not generated by this recipe”; it MUST NOT make valid palette data invalid.
- **FR2 — Requests describe complete author intent.** A generation request MUST
  describe the complete family set; normalized seeds; versioned intensity and
  neutral profiles; exact, bounded, and flexible anchors; an explicit stop
  layout; light and dark strategy; target gamut and encoding; and every other
  output-affecting parameter. Astryx tooling SHOULD default family ramps to the
  21-stop `0, 5, …, 100` layout, while accepting any non-empty author-defined
  numeric stop list. Compact and specialized layouts are valid author choices,
  not exceptions. Every candidate exposes exact standalone black and white
  values for direct theme authoring. Stops 0 and 100 repeat those values in
  generated families. Authors MAY omit the repeated endpoints with a custom
  stop list without losing the standalone values. The family identifiers
  `black` and `white` are reserved for those standalone values.
- **FR2a — Custom stop syntax is exact.** Every stop MUST be a finite JSON number
  from 0 through 100 inclusive. Stops MUST be unique and strictly increasing.
  Integer and decimal stops are valid; equivalent numeric spellings such as `5`
  and `5.0` identify the same stop and therefore cannot coexist. Endpoints 0 and
  100 are optional. A one-stop palette is valid. Serialization uses the canonical
  JSON number spelling produced by the implementation and MUST NOT depend on
  locale.
- **FR2b — Stop numbers are stable coordinates.** For the same recipe, family,
  mode, seed, vibrancy, profile, and compatible anchors, a shared stop MUST
  produce the same exact color in compact, full, and custom layouts. Adding or
  removing other stops MUST NOT renumber or change it. Generated TypeScript MUST
  expose only the requested stop keys, so an omitted stop fails type checking.
- **FR3 — Mode intent is explicit.** Light-only, dark-only, independent light and
  dark inputs, shared candidates, and named dark transforms are distinct. A
  light ramp MUST NOT silently become a reviewed dark ramp, and labels MUST NOT
  be reversed for dark mode.
- **FR4 — Constraints and preferences stay distinct.** Gamut validity,
  monotonicity, exact anchors, and bounded-anchor tolerances are hard constraints.
  Intensity, optical balance, and flexible anchors are optimization preferences.
  A conflict MUST fail clearly rather than moving an exact anchor, weakening a
  tolerance, substituting a profile, or changing the stop layout. An anchor MUST
  NOT turn stop 0 or 100 into a chromatic value; a conflicting endpoint anchor
  fails with guidance to use an interior stop.
- **FR5 — Recipes are deterministic and versioned.** A recipe identity MUST pin
  color space, constants, profiles, schedules, anchors, gamut handling, precision,
  rounding, serialization, and tie-breaking. The same normalized request MUST
  produce byte-identical canonical candidate output across supported platforms,
  with no ambient time, locale, path, network, randomness, traversal, or
  unrecorded dependency input.
- **FR6 — Generated candidates carry reproducibility evidence.** The generator
  MUST emit the complete candidate plus a detached record naming the normalized
  request, recipe and implementation versions, output format versions,
  adjustments, deviations, and every canonical output digest. An output change
  MUST change a matching identity or digest.
- **FR7 — Generation stops at a candidate.** Output MUST identify itself as a
  candidate and MUST NOT adopt values, map roles, or claim visual or accessibility
  approval. Preview is read-only. An explicit output option MAY save the candidate
  as a separate TypeScript or JSON file, but MUST NOT overwrite an existing file
  without explicit author intent. Once adopted, the palette is ordinary
  author-owned data: it may be edited freely and does not remain under generator
  control. Edited accepted data MUST NOT claim exact regeneration, and ordinary
  theme builds MUST NOT rerun the generator.
- **FR8 — The selected recipe preserves complete-family evidence.** The first
  production recipe MUST be pinned by its normative algorithm and canonical
  fixtures rather than another implementation. Before release, its
  version-pinned evidence MUST cover complete family sets,
  rendered light/dark contexts, hue continuity, luminance and adjacent-stop
  distinction, gamut, family balance, CVD simulations, reproducibility, and
  performance. Fixtures cover blue-to-purple, yellow-to-brown, disproportionate
  family strength, and blue/purple, yellow/green, and red/orange distinction.
  Output remains a candidate until an author accepts it.
- **FR9 — Accepted mapping is explicit, inspectable, and coherent.** The current
  authority that admits accepted palette/theme integration MUST define stable
  semantic-role references or an equivalently deterministic authoring-time mapping
  contract. Once an edited or regenerated palette is explicitly accepted, every
  role mapped to it MUST update coherently without requiring authors to recopy
  unrelated values by hand. Tooling MAY suggest a mapping, but a separate explicit
  apply action MUST show the target and patch, preserve author edits, and permit
  adjustment or rejection. This requirement does not choose the final
  `DefineThemeInput`, compiler, or artifact shape.
- **FR10 — Regeneration never recolors themes implicitly.** Generating a new
  candidate MUST NOT replace an adopted palette or change saved theme values,
  normalized tokens, CSS, built runtime modules, or mounted behavior. A committed
  palette edit MAY intentionally change theme mappings that explicitly reference
  it; that source diff and its rendered impact MUST be reviewed together.
- **FR11 — Validation is separate from construction.** Palette inspection uses a
  `validate*` or `check*` role in theme-package tests, internal test utilities, or
  an explicitly accepted future CLI checker. Validation-only data and helpers
  MUST stay outside Core runtime theme input and output.
- **FR12 — Accessibility is contextual.** Tools MAY report measured properties
  and contrast for explicit pairs. They MUST NOT label an isolated palette,
  family, stop, or suggestion accessible. Theme evidence names the exact
  foreground, background, text size, component state, mode, and non-color cues.
- **FR13 — Authoring has no runtime cost.** Generator code, color-math
  dependencies, candidates, reproducibility data, and suggestion logic MUST NOT
  enter Core component runtime, theme mounting, default theme CSS or JavaScript,
  or a theme package's default runtime export.
- **FR14 — Supported generation surfaces stay narrow.**
  `generateTonalPalette(request)` is a pure authoring function that returns
  candidate data without reading or writing files.
  `astryx theme palette generate <config>` is its non-interactive file adapter.
  TypeScript is the primary committed output so exact family and stop keys remain
  checkable; JSON MAY be requested for interoperable tooling. These surfaces MUST
  NOT rewrite a theme or perform semantic mapping implicitly. A future explicit
  first-class palette input, stable mapping contract, or compiler integration
  requires separate current authority; this requirement neither approves nor
  forbids one.
- **FR15 — Visual review uses one standard artifact.** The CLI MAY explicitly
  write a self-contained HTML preview from the same candidate data. The preview
  MUST identify itself as `palette-preview-v1`, show every generated family,
  mode, stop, and hex value, and require no network resources. It MUST NOT make
  an accessibility claim. It follows the same overwrite protection as palette
  output and MUST NOT open a browser without a separate explicit action.
- **FR16 — Authoring guidance preserves intent.** Agent-facing documentation and
  evaluation fixtures MUST distinguish exact, bounded, and flexible anchors;
  preserve explicit decimal and custom layouts; omit an accent when none is
  requested; and ask whether an ambiguous accent is one theme value or a light
  and dark family rather than guessing.
- **FR17 — New authoring uses palettes; legacy expansion remains compatible.** A
  theme-authoring interface MUST NOT present one accent input as an isolated edit
  when it also replaces neutral, surface, text, border, or other derived values.
  The Playground MUST omit `Create from accent` and retain direct editing of
  explicit color tokens. The CLI theme docs and generated theme template MUST
  recommend the supported palette workflow for new authoring. In the
  replacement-first patch, explicit reference documentation MUST identify
  `DefineThemeInput.color`, `ThemeAdaptationValue.color`, and
  `expandColorScale()` as deprecated legacy authoring APIs while documenting their
  existing behavior accurately for unmigrated themes. `ColorScaleConfig` and
  `ColorScaleTokens` remain stable public types during this lifecycle; this record
  does not schedule their removal.
- **FR18 — Color-scale deprecation is static, replacement-first, and lossless.**
  Before the replacement-first patch, all three surfaces remain `stable` and no
  declaration or warning labels them deprecated. That patch MUST ship the working
  palette replacement, stable versioned instructions, the exact modernization
  command, maintained-source migration, declaration `@deprecated` metadata, and
  authoring/build diagnostics together. Every diagnostic MUST name the applicable
  `DEP-*` id, exact replacement, stable instructions, and migration command.
  Deprecation MUST NOT add a runtime compatibility flag, runtime branch,
  rendered-app warning, or executable production-bundle bytes. For unmigrated
  source, existing token value strings (including CSS references), normalization,
  adaptation layers, inheritance, generated CSS, builds, and mounted behavior
  remain byte-equivalent during the deprecation window. The previewable and
  idempotent migration follows `spec:AST-040`, preserves those observables as its
  baseline, and reports dynamic, inherited, adaptation-bearing, or otherwise
  uncertain cases without rewriting them unless it can prove the replacement
  preserves the same behavior. Migration never invokes the palette generator: it
  writes the exact current token value strings as imported, theme-owned palette
  data or literal token values and references them through `tokens`. Removal
  requires the separate cleanup ids and minor-release approval in the lifecycle
  table below.

## Deprecation lifecycle

The three legacy surfaces follow `spec:AST-017` FR28–FR31 and FR29a–FR29d.
They share one authoring mechanism but are distinct public contracts, so each is
described and removed separately. Their direct authority is `spec:AST-008/FR18`.

### `DefineThemeInput.color`

- **Package / surface:** `@astryxdesign/core` type field.
- **Deprecation / cleanup:** `DEP-AST-008-COLOR-INPUT` /
  `CLN-AST-008-COLOR-INPUT`.
- **Old contract:** a `color` seed derives broad theme token values during
  `defineTheme()` normalization and remains inheritable by descendant themes.
- **Replacement:** `astryx theme palette generate` produces reviewed,
  theme-owned TypeScript palette data; the AST-040 codemod may instead import the
  exact existing token value strings as equivalent palette data. The theme writes
  semantic roles through existing `tokens` entries that reference that committed
  data. A later current authority may replace this authoring projection with
  first-class integration.
- **Warning:** `@deprecated` plus exact-source theme build or validation diagnostics,
  each naming the deprecation id, stable versioned instructions, and
  `astryx upgrade --from <installed-version> --apply`.
- **Migration / proof:** the AST-040 codemod materializes byte-equal token value
  strings, including CSS references, and proves equivalent normalized tokens,
  generated CSS, adaptation layers, inheritance, and extension behavior. It
  reports and leaves unchanged dynamic or inheritable uses it cannot prove.
- **State / target:** `stable` until the replacement-first patch ships, then
  `deprecated`; cleanup is unscheduled and requires the exact cleanup id in a
  frozen minor plan.
- **Rollback:** before cleanup, revert the migration patch or keep the deprecated
  field; after cleanup, a compatible recovery patch restores the field and its
  byte-equivalent normalization.

### `ThemeAdaptationValue.color`

- **Package / surface:** `@astryxdesign/core` nested type field.
- **Deprecation / cleanup:** `DEP-AST-008-ADAPTATION-COLOR` /
  `CLN-AST-008-ADAPTATION-COLOR`.
- **Old contract:** an adaptation rule supplies a partial color-scale configuration
  completed from the effective root color axis.
- **Replacement:** adaptation rules write condition-specific semantic roles through
  existing `value.tokens` entries that reference the same committed theme-owned
  palette data.
- **Warning:** `@deprecated` plus exact-source theme validation diagnostics carrying
  the same instruction and migration fields.
- **Migration / proof:** the AST-040 codemod preserves each lowered adaptation token
  string and rule order. It reports and leaves unchanged partial, inherited, or
  dynamic rules unless it can prove equivalent completion and CSS.
- **State / target:** `stable` until the replacement-first patch ships, then
  `deprecated`; cleanup is unscheduled and independent of the root field cleanup.
- **Rollback:** before cleanup, retain or restore the deprecated field; after cleanup,
  a compatible recovery patch restores its completion and lowering behavior.

### `expandColorScale()`

- **Package / surface:** `@astryxdesign/core` function export.
- **Deprecation / cleanup:** `DEP-AST-008-EXPAND-COLOR-SCALE` /
  `CLN-AST-008-EXPAND-COLOR-SCALE`.
- **Old contract:** a public authoring helper expands `ColorScaleConfig` into broad
  token overrides, including live CSS references.
- **Replacement:** the AST-040 codemod inlines the exact returned token map as a
  committed TypeScript module whose strings are imported directly, or migrates a
  theme callsite to existing `tokens` / adaptation `value.tokens` references backed
  by that committed data.
- **Warning:** `@deprecated` plus exact-source authoring or build diagnostics carrying
  the same instruction and migration fields.
- **Migration / proof:** the AST-040 codemod materializes byte-equal returned token
  strings when the call is statically resolvable. Dynamic calls are reported and
  left unchanged. Old helper output and migrated theme output are compared for
  representative and downstream usage.
- **State / target:** `stable` until the replacement-first patch ships, then
  `deprecated`; cleanup is unscheduled and independent of both field cleanups.
- **Rollback:** before cleanup, retain or restore the deprecated export; after cleanup,
  a compatible recovery patch restores the export and its byte-equivalent output.

`ColorScaleConfig` and `ColorScaleTokens` remain stable public types and are not
assigned cleanup ids by this record.

The replacement-first patch ships the working palette path, stable versioned
instructions, AST-040 codemod, static declaration metadata, exact-source theme
build or validation diagnostics, maintained-source migration, and old/new
compatibility proof together. FR17's Playground and new-authoring guidance
requirements apply immediately and do not wait for the replacement-first patch.
The patch's maintained-source migration covers remaining uses of the three legacy
surfaces in examples, stories, tests, and repository-owned themes. `defineTheme`,
theme mounting, and rendered applications never emit deprecation warnings. Cleanup
approval for one id does not authorize removal of another.

## Implementation contract

1. `astryx-oklch-v1` is defined in one owned production engine that pins its
   constants, transformations, and exact regression vectors.
2. The pure authoring API and CLI adapter use one deterministic engine and agree
   on recipe semantics. The CLI follows `architecture:cli-surface` for its
   command, response, error, documentation, support, and write contract.
3. Generated TypeScript exports author-owned palette data without importing the
   generator. Generated JSON contains the same canonical palette values.
4. The optional HTML preview is generated by one versioned renderer rather than
   improvised by each agent or caller.
5. Every public function, command, package, schema, or artifact receives separate
   API and AST-017 compatibility acceptance before release.
6. Focused agent fixtures cover anchor language, optional accents, clarification,
   and custom stops. Expected decisions remain evaluation-only and MUST NOT be
   included in prompts sent to agents.

### `astryx-oklch-v1` normative recipe

The first production recipe is defined here and pinned by canonical fixtures:

- Normalize supported seed and anchor colors to lowercase six-digit sRGB hex.
- Convert sRGB through the standard D65 OKLab matrices, then express hue and
  chroma in OKLCH.
- Convert requested tone to lightness with the CIELAB L* transfer: values above
  8 use `((tone + 16) / 116)³`; lower values use `tone / 903.3`; the result is
  cube-rooted for OKLab lightness.
- Apply the pinned tone chroma envelope
  `0.18 + 0.82 × sqrt(sin(π × tone / 100))`.
- Apply hue-balance factors 0.94 for `[70,115)`, 0.78 for `[115,175)`, 0.82 for
  `[175,230)`, 0.90 for `[285,340)`, and 1 elsewhere. Orange hues `[40,70)`
  rotate toward red below tone 50 by at most 8 degrees so low orange stops stay
  distinct from the red family.
- Above tone 60, green hues `[115,175)` taper to 72% of their balanced chroma
  and teal hues `[175,200)` taper to 60% at tone 95 using smoothstep. This keeps
  their light stops optically balanced without muting cyan or changing the
  midtone anchors.
- Vibrancy 50 is neutral. Values 0–25 interpolate to multiplier 0.72; values
  25–50 interpolate from 0.72 to 1; values above 50 add 0.0096 per point.
- Cross-family coordination mixes source chroma 35% with reference chroma 0.18
  at 65%. Neutral profiles are `neutral-v1` (hue 0, chroma 0), `warm-v1`
  (hue 75, chroma 0.018), `cool-v1` (hue 250, chroma 0.018), and `custom`
  (the normalized neutral seed).
- Stop numbers retain the same literal tone meaning in both modes. Dark ramps
  multiply chroma by 0.85 without silently shifting the requested tone. Stop 0
  therefore resolves to exact black in either mode, and stop 100 resolves to
  exact white. Both endpoints are included by default and MAY be omitted by an
  explicit custom layout.
- Out-of-gamut OKLCH candidates preserve lightness and hue while chroma is found
  by 20 iterations of binary search over `[0, 0.4]`.
- Exact anchors replace their stop. Bounded anchors move toward the requested
  color only within their declared OKLab Euclidean `maxDeltaE`; flexible anchors
  blend 35% toward the requested color. Anchor corrections use smoothstep
  interpolation and taper to zero 25 tone units beyond the nearest anchor.
- Convert final colors to sRGB by rounding each clamped channel to the nearest
  8-bit integer. Emit lowercase `#rrggbb`. Canonical JSON uses two-space
  indentation, insertion-ordered families and stops, and one trailing newline.
  Candidates expose the requested stop layout as an ordered `stops` array;
  family ramp objects are lookup maps and do not define iteration order.
- Invalid requests fail before producing a candidate. Family-local anchor
  conflicts report the family and produce no adoptable output.

The following canonical candidate fixtures use SHA-256 over UTF-8 canonical JSON:

| Fixture                | Request summary                                                                                | Candidate bytes | SHA-256                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------- | --------------: | ------------------------------------------------------------------ |
| `default-three-family` | Neutral `#777777`, blue `#0074e2`, orange `#d57113`; both modes; vibrancy 50; 21 default stops |            3755 | `11c40191d508274d89d631bb4e1cb662f70ff0dce6c0dec101c317f9f69d3e25` |
| `exact-anchor`         | Blue `#0074e2`; light only; stops 20, 50, 80; exact stop-50 anchor `#1682d5`                   |             327 | `c42929be3c4b5cb857cada078f62bb5a2242c1a22cfa4ae7546a18592540f7f3` |
| `single-custom-stop`   | Red `#d62830`; dark only; stop 40                                                              |             258 | `88d3d69865c74c7fb14347b9967575285a7d44ab893087a08bc842bb66b29bbb` |
| `high-tone-balance`    | Green `#358a3a`, teal `#0c7365`, cyan `#0c6f82`; both modes; stops 60, 80, 95                  |             910 | `873821574fdbe3357304dbc06986bd2e5ec88af80d0f36305626fd826c3cf07b` |

Exact fixture equality is the release gate for recipe compatibility. Monotonicity,
adjacent-stop distance, hue drift, family distinction, gamut events, and CVD
simulations are recorded as design evidence for the complete candidate; they do
not become universal accessibility or contrast guarantees for isolated colors.

## Current-state impact

| State                       | Required result                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Generation absent           | Existing themes, builds, runtime bytes, and supported package ranges stay unchanged.                                      |
| Candidate produced          | No source, theme, package, or runtime output changes.                                                                     |
| Palette accepted            | Exact values enter theme-owned palette data under `theme:<name>`; a later current authority may standardize the shape.    |
| Mapping accepted            | Under that authority, stable semantic-role references are inspectable, reviewable, and update coherently.                 |
| New candidate generated     | Adopted palettes and rendered output stay unchanged until an explicit review and save.                                    |
| Adopted palette edited      | Under that authority, explicitly accepting the edit updates mapped roles coherently; unrelated literal values stay fixed. |
| Playground color edit       | Explicit token editing remains; no accent edit silently expands into unrelated color tokens.                              |
| Legacy surface before patch | Stable, fully supported, and unlabeled; Playground and maintained new-authoring guidance follow FR17 immediately.         |
| Replacement-first patch     | Replacement, guidance, migration, static metadata, diagnostics, source migration, and compatibility proof ship together.  |
| Deprecated API used         | Normalization, token strings, inheritance, CSS, builds, and mounted behavior remain byte-equivalent.                      |
| Migration run               | Proven uses preserve exact observables; uncertain dynamic, inherited, or adaptation-bearing cases remain unchanged.       |

## Verification

Verification MUST cover cross-platform deterministic vectors; hard failures;
every candidate source and provenance state; complete-family regression/CVD
evidence; candidate-versus-accepted identity; inspectable stable role mappings;
runtime/default-bundle absence; real-Chromium evidence for accepted mappings;
Playground evidence that accent editing does not invoke legacy color-scale
expansion or mutate unrelated tokens; static `@deprecated` declaration metadata;
exact-source theme build or validation diagnostics; absence of deprecation-only
runtime branches, logs, executable bytes, or output changes; maintained-source
migration; and AST-040 preview, idempotence, and refusal fixtures. Migration proof
MUST compare token value strings including CSS references, normalized root and
adaptation layers, generated CSS, inheritance, and descendant extension behavior.

## Decision log

### DEC-5 and DEC-9 — Preserve complete-recipe evidence

**Decider:** `cixzhang`, `2026-09-01` through `2026-09-02`

FR8 preserves Ruby's complete-authoring requirements and the comparison evidence
behind the selected OKLCH direction. A color-space name or isolated ramps alone
do not define the production recipe.

### DEC-10 — Accepted palettes are committed snapshots

**Decider:** `cixzhang`, `2026-09-03`

Accepted palettes are committed snapshots. Theme mappings use literal CSS values
or explicit references to committed palette data; generation never runs implicitly.
A generated candidate changes no accepted source or rendered output until an author
explicitly accepts it.

Rejected: an implicit generator run during ordinary theme normalization or build,
because it would recolor a theme without an explicit accepted source change.

### DEC-11 — Generation has one authoring engine and two adapters

**Decider:** `cixzhang`, `2026-09-03`

The CLI theme-authoring workflow is the first supported consumer. The pure
`generateTonalPalette()` API enables programmatic authoring without filesystem
effects; `astryx theme palette generate` adds preview and explicit file output.
Both use the same `astryx-oklch-v1` engine. Neither enters Core or
`defineTheme()`.

### DEC-12 — The generator defaults without restricting palette authors

**Decider:** `rubyycheung`, `2026-09-03`

The first production generator defaults each family to the familiar 21-position
`0, 5, …, 100` layout and accepts any explicit non-empty numeric stop list.
Every candidate exposes exact black and white as standalone authoring values.
Stops 0 and 100 repeat them in each generated family so authors can retain a
complete coordinate range or remove the repeated endpoints explicitly without
losing access to either solid. Generated TypeScript names the values `black`
and `white`; theme-owned palette wrappers may expose them alongside families,
for example as `neutralPalettes.black` and `neutralPalettes.white`. Those names
are reserved from family identifiers. The generated candidate becomes
author-owned after review and acceptance. Generator defaults therefore do not
become palette-validity rules.

Generated palettes are reviewable starting points. Authors may adjust
family-level inputs and regenerate until the palette matches their intended
expression; only the explicitly approved output becomes the theme-owned palette.

Rejected: requiring every accepted palette to use the generator's 21-stop
default. Themes may need compact or specialized palettes for iconography,
illustration, visualization, or brand expression.

### DEC-13 — Intermediate stops are generated explicitly

**Deciders:** `cixzhang`, `rubyycheung`, `2026-09-03`

Compact and full presets share the same 0–100 tonal coordinate system, and
custom layouts remain valid. An author who needs an intermediate value such as
12.5 requests that stop during generation and reviews the emitted exact hex.
The committed TypeScript then exposes `family[12.5]` as an actual typed key.

Rejected: restricting palette authors to two stop counts, renumbering stops when
the layout changes, or adding a runtime `family.get(12.5)` that creates an
unreviewed color after authoring.

### DEC-14 — Playground color editing does not imply palette generation

**Decider:** `rubyycheung`, `2026-09-30`

The Playground keeps direct semantic-token editing and omits `Create from
accent`. A one-accent control is not palette authoring when it also replaces
neutral, surface, text, border, and related values without exposing a candidate
palette or a separate mapping decision. Maintained authoring surfaces recommend
the supported palette workflow instead.

Rejected: replacing the control with another generator while retaining automatic
token rewrites, because that still collapses generation, review, and mapping.

### DEC-15 — Legacy color-scale authoring follows static replacement-first deprecation

**Decider:** `cixzhang`, `2026-10-07`

`DefineThemeInput.color`, `ThemeAdaptationValue.color`, and
`expandColorScale()` remain stable until one patch ships the complete replacement,
versioned guidance, AST-040 modernization, static metadata, exact-source
diagnostics, maintained-source migration, and compatibility proof. They then
enter `deprecated` with byte-equivalent executable behavior and no runtime warning
or branch. Each public surface owns a separate deprecation and cleanup id.

Future first-class palette input, stable semantic-role mapping, and compiler
integration remain open to AST-018 if amended and accepted, or to a later current
authority. AST-008 requires explicit acceptance, coherent mapped updates, and no
implicit generator run without selecting that future API shape.

Rejected: a runtime compatibility flag or deprecation warning, or a permanent ban
on first-class palette/theme integration.

## Open questions

- **OQ1 — What is the first-class accepted palette/theme contract?** A later
  current authority—AST-018 only if amended and accepted—must settle the public
  input shape, stable semantic-role references, authoring and compilation
  behavior, validation, and artifact lifecycle. AST-008 requires explicit review,
  coherent mapped updates, and no implicit generator run without selecting among
  those API shapes.
