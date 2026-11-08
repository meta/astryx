---
schema_version: 2
template_version: 2
kind: theme
id: theme:butter
authority: current
approved_by: rubyycheung
approved_at: 2026-10-17
review_triggers:
  [tokens, palette-values, component-mappings, contrast, artifacts]
verified_by:
  [
    packages/themes/butter/src/butterTheme.test.ts,
    packages/themes/butter/src/butterColorMapping.test.ts,
    packages/themes/butter/src/butterPalettes.test.ts,
    scripts/generate-butter-palette-refs.test.mjs,
  ]
package: '@astryxdesign/theme-butter'
source_theme: packages/themes/butter/src/butterTheme.ts
references:
  [
    architecture:theme-authoring-contract,
    architecture:theme-tokens,
    architecture:theme-compilation,
  ]
---

# Butter theme specification

## Intent and audience

Butter is a warm golden theme with a signature saturated Blue accent, Butter
Yellow, creamy neutral surfaces, and soft categorical colors. It serves
experiences that want playful warmth without losing semantic clarity in light
and dark modes.

## Inheritance and base

Butter starts from Astryx core defaults and overrides selected typography,
motion, radius, shadow, semantic color, syntax, icon, and component values. It
does not extend another published package theme.

## Portable token overrides

The exact maintained values live in `source_theme`. Butter owns its light and
dark surface ladders, signature accents, status and categorical selections,
syntax colors, color-bearing shadows, and existing component mappings. Portable
token vocabulary remains owned by `architecture:theme-tokens`.

## Theme-local role definitions

Butter defines no public theme-local token names. Its package-specific decisions
use existing portable tokens and component mapping slots.

## Tonal palette definitions

Butter owns complete private light and dark ramps for warm neutral, accent,
blue, cyan, green, orange, pink, purple, red, teal, and yellow. The committed
request, generated module, and receipt reproduce the accepted
`astryx-oklch-v1` result.

Accent Light 40 is exact brand Blue `#225BFF`. Yellow Dark 90 is exact Butter
Yellow `#FDEE8C`. Green and Red remain anchorless and smooth. Error, Warning, and
Success roles use the Red, Yellow, and Green families rather than duplicate
semantic palette families.

Palette generation is explicit maintenance work and never runs during a normal
theme build.

## Component and state mappings

Butter maps existing semantic, categorical, syntax, and color-bearing effect
roles to named Butter palette stops. Status roles and matching categorical
families share Red, Yellow, and Green sources. Components consume semantic
tokens rather than the complete palette.

Butter defines no additional component states or data-visualization colors.

## Compatibility and migration

The released `butterPalettes` object remains byte-identical in its established
package export. Complete mode-aware ramps remain private to authoring, mapping,
tests, and review tooling.

Consumers can extend `butterTheme` and override color, syntax, shadow, and
component values while preserving the released package contract.

## Accessibility and contrast evidence

Butter-specific mapping and rendered-component evidence covers light and dark
semantic and categorical states. A palette stop alone is not an accessibility
claim; contextual component evidence remains authoritative.

Butter's maintained Badge, Banner, FieldStatus, and TopNav text pairings use
named palette stops that clear normal-text AA in their rendered contexts:

- info Badge, Banner title, Banner body, and FieldStatus text use Neutral Light
  15 on Accent Light 55 at 4.85:1;
- error Badge, Banner title, Banner body, and FieldStatus text use Neutral Light
  15 on Red Light 60 at 5.02:1;
- the neutral Badge uses Accent Light 35 on exact Butter Yellow at 5.49:1;
- light-mode TopNav items use Accent Light 40 at 5.01:1 or Accent Light 35
  at 6.20:1 on the warm navigation surface; and
- success and warning states retain their darker Neutral Light 15 text.

These checks cover normal-sized text in each named component state; every pairing
clears the 4.5:1 normal-text threshold. The same visible status icon and text
label identify semantic states independently of color.

## Build and artifact contract

The package and CLI template carry identical palette requests, generated
candidates, receipts, selected-reference modules, and theme mappings. The
selected-reference module is deterministically derived from `source_theme` and
the committed private palette. A non-writing check fails for missing, extra,
stale, or invalid references.

Normal package builds consume committed references and never regenerate palette
values.

## Verification map

| Theme contract          | Evidence                                             | Representative states                  | Failure signal                                                    |
| ----------------------- | ---------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| Palette identity        | Config, generated module, receipt, reproduction test | light and dark; every family           | Regeneration changes accepted values or stable provenance.        |
| Signature colors        | Palette and mapping tests                            | Blue accent; Butter Yellow; warm body  | An exact signature value moves.                                   |
| Role mapping            | Butter mapping and theme tests                       | semantic, categorical, syntax, effects | A maintained role bypasses selected Butter references.            |
| Public compatibility    | Legacy object test and package build                 | keys and every released value          | The released object differs from its established shape or values. |
| Package/template parity | Byte comparison and build                            | package and CLI template               | Copies diverge.                                                   |

## Decision log

### DEC-1 — Butter owns one reproducible mode-aware palette

**Reference:** `theme:butter/DEC-1`
**Decider:** `rubyycheung`, `2026-10-17`

Butter keeps its creamy neutral canvas, signature Blue and Yellow, and playful
categorical identity in complete private light and dark ramps. Request,
generated result, receipt, and visual evidence change together.

Rejected: inheriting another theme's palette or regenerating values during
normal builds.

### DEC-2 — Signature Blue and Butter Yellow remain exact

**Reference:** `theme:butter/DEC-2`
**Decider:** `rubyycheung`, `2026-10-17`

Accent Light 40 remains `#225BFF`, and Yellow Dark 90 remains `#FDEE8C`. These
anchors preserve Butter's recognizable brand accents while surrounding stops
remain smooth.

Rejected: approximating either signature color with an unanchored stop.

### DEC-3 — Status roles reuse categorical color families

**Reference:** `theme:butter/DEC-3`
**Decider:** `rubyycheung`, `2026-10-17`

Error, Warning, and Success roles map through Red, Yellow, and Green. The private
palette contains no duplicate Error, Warning, or Success families.

Rejected: parallel semantic ramps that duplicate categorical hue ownership.

### DEC-4 — Existing roles use selected Butter palette references

**Reference:** `theme:butter/DEC-4`
**Decider:** `rubyycheung`, `2026-10-17`

Butter's semantic, categorical, syntax, and color-bearing effect values use
named Butter palette stops. Alpha variants derive from selected stops, and
mappings preserve role intent rather than applying blind nearest-color matches.

Rejected: adding data-visualization overrides or letting components consume the
complete private palette.

### DEC-5 — The released palette object stays compatible

**Reference:** `theme:butter/DEC-5`
**Decider:** `rubyycheung`, `2026-10-17`

`butterPalettes` keeps its released shape and values. Complete mode-aware ramps
remain private authoring data.

Rejected: forcing existing consumers onto the generated palette shape.

### DEC-6 — Runtime references are deterministic and minimal

**Reference:** `theme:butter/DEC-6`
**Decider:** `rubyycheung`, `2026-10-17`

Butter's selected-reference module contains exactly the family, mode, and stop
values referenced by the maintained theme. Write mode synchronizes package and
CLI-template outputs; check mode compares the complete projection without
writing.

Rejected: bundling the complete private palette or maintaining a manual
selection manifest.

## Open questions

- **OQ1 — Cross-theme contrast methodology** (`human-design`): Which current
  design record owns the human visual and accessibility methodology used to
  judge token and color pairings? No current design record owns this dependency;
  Butter owns only its theme-specific pairings, exceptions, and measured evidence.

## Content boundary

This record owns Butter's intent, selected token and palette mappings, required
states, theme-specific exceptions, measured receipts, known gaps,
compatibility, artifacts, and evidence. Shared generation mechanics and token
vocabulary belong to architecture and tooling. Component behavior belongs to
component or family records. Consumer syntax belongs to consumer documentation.
