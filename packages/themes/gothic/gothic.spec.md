---
schema_version: 2
template_version: 2
kind: theme
id: theme:gothic
authority: current
approved_by: rubyycheung
approved_at: 2026-10-17
review_triggers:
  [tokens, palette-values, component-mappings, contrast, artifacts]
verified_by:
  [
    packages/themes/gothic/src/gothicTheme.test.ts,
    packages/themes/gothic/src/gothicColorMapping.test.ts,
    scripts/generate-gothic-palette-refs.test.mjs,
  ]
package: '@astryxdesign/theme-gothic'
source_theme: packages/themes/gothic/src/gothicTheme.ts
references:
  [
    architecture:theme-authoring-contract,
    architecture:theme-tokens,
    architecture:theme-compilation,
  ]
---

# Gothic theme specification

## Intent and audience

Gothic is a dark-only atmospheric theme with deep blue-gray surfaces, restrained
pastel categorical panels, and jewel-tone syntax colors. It serves experiences
that want manuscript and noir character without reducing semantic clarity.

## Inheritance and base

Gothic starts from Astryx core defaults and overrides selected typography,
motion, radius, shadow, semantic color, syntax, icon, and component values. It
renders one dark appearance regardless of system color preference and does not
extend another published package theme.

## Portable token overrides

The exact maintained values live in `source_theme`. Gothic owns its dark surface
ladder, content hierarchy, status and categorical selections, syntax colors,
color-bearing shadows, and existing component mappings. Portable token
vocabulary remains owned by `architecture:theme-tokens`.

## Theme-local role definitions

Gothic defines no public theme-local token names. Its package-specific decisions
use existing portable tokens and component mapping slots.

## Tonal palette definitions

Gothic owns complete private dark ramps for neutral, blue, cyan, green, orange,
pink, purple, red, teal, and yellow. The committed request, generated module,
and receipt reproduce the accepted `astryx-oklch-v1` result. Deliberate anchors
preserve Gothic's blue-gray neutral ladder, pastel categorical surfaces, and
jewel-tone syntax identity.

Palette generation is explicit maintenance work and never runs during a normal
theme build. The request uses only fields implemented by the recipe.

## Component and state mappings

Gothic maps existing semantic, categorical, syntax, and color-bearing effect
roles to named Gothic dark-palette stops. Secondary controls retain Gothic's
established dark-slate treatment, and component states keep their existing
meanings. Components consume semantic tokens rather than the complete palette.

Gothic defines no additional component states or data-visualization colors.

## Compatibility and migration

The released `gothicPalettes` export remains a flat ramp for each family,
including numeric stops and `hue` and `chroma` metadata. The complete generated
dark palette remains private to authoring, mapping, tests, and review tooling.

Consumers can extend `gothicTheme` and override color, syntax, shadow, and
component values while preserving the released package contract.

## Accessibility and contrast evidence

Gothic-specific mapping and rendered-component evidence covers its only
supported mode and maintained semantic and categorical states. A palette stop
alone is not an accessibility claim; contextual component evidence remains
authoritative. Yellow text uses `yellow.dark[15]` (`#573f0b`) on
`yellow.dark[75]` (`#d3c490`) at 5.69:1, and pink text uses
`pink.dark[15]` (`#5c182f`) on `pink.dark[75]` (`#c89aab`) at 5.33:1.
Both pairings keep category and status content on named Gothic stops while
clearing normal-text AA. Syntax comments use `neutral.dark[65]` (`#7e8791`) on
`neutral.dark[10]` (`#101314`) at 5.12:1, so the maintained syntax mapping also
clears normal-text AA without an off-palette value.

## Build and artifact contract

The package and CLI template carry identical palette requests, generated
candidates, receipts, selected-reference modules, and theme mappings. The
selected-reference module is deterministically derived from `source_theme` and
the committed private palette. A non-writing check fails for missing, extra,
stale, or invalid references.

Normal package builds consume committed references and never regenerate palette
values.

## Verification map

| Theme contract          | Evidence                                             | Representative states                  | Failure signal                                             |
| ----------------------- | ---------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Dark palette identity   | Config, generated module, receipt, reproduction test | every family and stop                  | Regeneration changes accepted values or stable provenance. |
| Role mapping            | Gothic mapping and theme tests                       | semantic, categorical, syntax, effects | A maintained role bypasses selected Gothic references.     |
| Public compatibility    | Flat-ramp compatibility test and package build       | numeric stops; `hue`; `chroma`         | A released member or shape changes.                        |
| Mode contract           | Theme CSS and rendered evidence                      | dark only                              | Light-dependent output or divergent mode values appear.    |
| Package/template parity | Byte comparison and build                            | package and CLI template               | Copies diverge.                                            |

## Decision log

### DEC-1 — Gothic owns one reproducible dark-only palette

**Reference:** `theme:gothic/DEC-1`
**Decider:** `rubyycheung`, `2026-10-17`

Gothic keeps its blue-gray canvas, pastel categorical panels, and jewel-tone
syntax identity in complete private dark ramps. Request, generated result,
receipt, and visual evidence change together.

Rejected: inheriting another theme's palette, adding a light mode, or
regenerating values during normal builds.

### DEC-2 — Existing roles use selected Gothic palette references

**Reference:** `theme:gothic/DEC-2`
**Decider:** `rubyycheung`, `2026-10-17`

Gothic's semantic, categorical, syntax, and color-bearing effect values use
named Gothic palette stops. Alpha variants derive from selected stops, and
mappings preserve role intent rather than applying blind nearest-color matches.

Rejected: adding data-visualization overrides or letting components consume the
complete private palette.

### DEC-3 — The released flat palette stays compatible

**Reference:** `theme:gothic/DEC-3`
**Decider:** `rubyycheung`, `2026-10-17`

`gothicPalettes` keeps its released flat family shape, numeric stops, `hue`, and
`chroma`. The generated dark palette remains private authoring data.

Rejected: forcing existing consumers onto the generated palette shape.

### DEC-4 — Runtime references are deterministic and minimal

**Reference:** `theme:gothic/DEC-4`
**Decider:** `rubyycheung`, `2026-10-17`

Gothic's selected-reference module contains exactly the family, mode, and stop
values referenced by the maintained theme. Write mode synchronizes package and
CLI-template outputs; check mode compares the complete projection without
writing.

Rejected: bundling the complete private palette or maintaining a manual
selection manifest.

## Open questions

- **OQ1 — Cross-theme contrast methodology** (`human-design`): Which current
  design record owns the human visual and accessibility methodology used to
  judge token and color pairings? No current design record owns this dependency;
  Gothic owns only its theme-specific pairings, exceptions, and measured evidence.

## Content boundary

This record owns Gothic's intent, selected token and palette mappings, required
states, theme-specific exceptions, measured receipts, known gaps,
compatibility, artifacts, and evidence. Shared generation mechanics and token
vocabulary belong to architecture and tooling. Component behavior belongs to
component or family records. Consumer syntax belongs to consumer documentation.
