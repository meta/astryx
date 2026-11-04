---
schema_version: 2
template_version: 2
kind: theme
id: theme:stone
authority: current
approved_by: rubyycheung
approved_at: 2026-10-17
review_triggers:
  [tokens, palette-values, component-mappings, contrast, artifacts]
verified_by:
  [
    packages/themes/stone/src/stoneTheme.test.ts,
    packages/themes/stone/src/stoneColorMapping.test.ts,
    scripts/check-stone-secondary-text-contrast.test.mjs,
  ]
package: '@astryxdesign/theme-stone'
source_theme: packages/themes/stone/src/stoneTheme.ts
references:
  [
    architecture:theme-authoring-contract,
    architecture:theme-tokens,
    architecture:theme-compilation,
  ]
---

# Stone theme specification

## Intent and audience

Stone provides a quiet, handcrafted theme built from warm violet-neutral
surfaces and restrained earthy categorical colors. Status and categorical
states remain recognizable without becoming brighter than the neutral canvas.

## Inheritance and base

Stone starts from Astryx core defaults and overrides selected typography,
motion, radius, shadow, semantic color, syntax, icon, and component values. It
does not extend another published package theme.

## Portable token overrides

The exact maintained values live in `source_theme`. Stone owns its surface
ladder, content hierarchy, status and categorical selections, color-bearing
syntax and shadow values, and existing component mappings. Portable token
vocabulary remains owned by `architecture:theme-tokens`.

## Theme-local role definitions

Stone defines no public theme-local token names. Its package-specific decisions
are expressed through existing portable tokens and component mapping slots.

## Tonal palette definitions

Stone owns complete private light and dark ramps for neutral, red, orange,
yellow, green, teal, cyan, blue, purple, and pink. The committed request,
generated module, and receipt reproduce the accepted `astryx-oklch-v1` result.
The palette preserves Stone's violet-neutral identity and its exact Orange
stop-90 and light Yellow stop-90 pastel anchors. Green, Yellow, Teal, and Cyan
use reviewed re-seeded midpoints rather than the released compatibility-ramp
midpoints.

Palette generation is explicit maintenance work and never runs during a normal
theme build. The generated request uses only fields implemented by the recipe.

## Component and state mappings

Stone maps existing semantic and categorical roles to named Stone palette stops.
Badges, banners, field statuses, progress fills, and input status rims preserve
their existing meanings while sharing one reviewed color source. Components
consume semantic tokens rather than the complete palette.

Stone defines no additional component states or data-visualization colors.

## Compatibility and migration

The released `stonePalettes` export remains a flat shared ramp for each family,
including numeric stops and `hue` and `chroma` metadata. Complete mode-aware
ramps remain private to authoring, mapping, tests, and review tooling.

Consumers can extend `stoneTheme` and override color, syntax, shadow, and
component values while preserving the released package contract.

## Accessibility and contrast evidence

Stone-specific tests verify secondary text, the maintained light input status
rims, and light syntax attributes. Mapping tests verify the selected stops for
categorical roles; rendered-component evidence covers those categorical states.
A palette stop alone is not an accessibility claim; contextual component evidence
remains authoritative.
Light input success and warning rims use Green and Yellow stop 55, measuring
3.46:1 and 3.33:1 against the white input surface. Light syntax attributes use
Yellow stop 40, measuring 5.19:1 on the code background and at least 5.00:1 on
added and removed diff rows.

## Build and artifact contract

The package and CLI template carry identical palette requests, generated
candidates, receipts, selected-reference modules, and theme mappings. The
selected-reference module is deterministically derived from `source_theme` and
the committed private palette. A non-writing check fails for missing, extra,
stale, or invalid references.

Normal package builds consume the committed selected references and never
regenerate palette values.

## Verification map

| Theme contract          | Evidence                                             | Representative states                                                     | Failure signal                                             |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Palette identity        | Config, generated module, receipt, reproduction test | light and dark; every family                                              | Regeneration changes accepted values or stable provenance. |
| Role mapping            | Stone mapping and theme tests                        | semantic, categorical, syntax, effects                                    | A maintained role bypasses selected Stone references.      |
| Public compatibility    | Flat-ramp compatibility test and package build       | numeric stops; `hue`; `chroma`                                            | A released member or shape changes.                        |
| Contextual contrast     | Stone contrast tests and rendered components         | secondary text; input rims; syntax attribute; rendered categorical states | A tested pairing misses its required threshold.            |
| Package/template parity | Byte comparison and build                            | package and CLI template                                                  | Copies diverge.                                            |

## Decision log

### DEC-1 — Stone owns one reproducible mode-aware palette

**Reference:** `theme:stone/DEC-1`
**Decider:** `rubyycheung`, `2026-10-17`

Stone keeps its warm violet-neutral canvas and restrained earthy categorical
identity in complete private light and dark ramps. Request, generated result,
receipt, and visual evidence change together.

Rejected: inheriting another theme's palette or regenerating values during
normal builds.

### DEC-2 — Existing roles use selected Stone palette references

**Reference:** `theme:stone/DEC-2`
**Decider:** `rubyycheung`, `2026-10-17`

Stone's semantic, categorical, syntax, and color-bearing effect values use named
Stone palette stops. Alpha variants derive from the selected stop. Mappings are
role-aware rather than blind nearest-color substitutions.

Rejected: adding data-visualization overrides or letting components consume the
complete private palette.

### DEC-3 — The released flat palette stays compatible

**Reference:** `theme:stone/DEC-3`
**Decider:** `rubyycheung`, `2026-10-17`

`stonePalettes` keeps its released flat family shape, numeric stops, `hue`, and
`chroma`. Mode-aware ramps remain private authoring data.

Rejected: forcing existing consumers onto a new public palette shape.

### DEC-4 — Runtime references are deterministic and minimal

**Reference:** `theme:stone/DEC-4`
**Decider:** `rubyycheung`, `2026-10-17`

Stone's selected-reference module contains exactly the family, mode, and stop
values referenced by the maintained theme. Write mode synchronizes package and
CLI-template outputs; check mode compares the complete projection without
writing.

Rejected: bundling the complete private palette or maintaining a manual
selection manifest.

## Open questions

- **OQ1 — Cross-theme contrast methodology** (`human-design`): Which current
  design record owns the human visual and accessibility methodology used to
  judge token and color pairings? No current design record owns this dependency;
  Stone owns only its theme-specific pairings, exceptions, and measured evidence.

## Content boundary

This record owns Stone's intent, selected token and palette mappings, required
pairings and states, theme-specific exceptions, measured receipts, known gaps,
compatibility, artifacts, and evidence. Shared generation mechanics and token
vocabulary belong to architecture and tooling. Component behavior belongs to
component or family records. Consumer syntax belongs to consumer documentation.
