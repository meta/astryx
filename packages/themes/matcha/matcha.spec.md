---
schema_version: 2
template_version: 2
kind: theme
id: theme:matcha
authority: current
approved_by: rubyycheung
approved_at: 2026-10-17
review_triggers:
  [tokens, palette-values, component-mappings, contrast, artifacts]
verified_by:
  [
    packages/themes/matcha/src/matchaTheme.test.ts,
    packages/themes/matcha/src/matchaColorMapping.test.ts,
    scripts/generate-matcha-palette-refs.test.mjs,
  ]
package: '@astryxdesign/theme-matcha'
source_theme: packages/themes/matcha/src/matchaTheme.ts
references:
  [
    architecture:theme-authoring-contract,
    architecture:theme-tokens,
    architecture:theme-compilation,
  ]
---

# Matcha theme specification

## Intent and audience

Matcha is an earthy botanical theme with tea-green neutrals, warm Tea Gold, and
restrained natural categorical colors. It serves experiences that want organic
character while preserving familiar semantic hierarchy in light and dark modes.

## Inheritance and base

Matcha starts from Astryx core defaults and overrides selected typography,
motion, radius, shadow, semantic color, syntax, icon, and component values. It
does not extend another published package theme.

## Portable token overrides

The exact maintained values live in `source_theme`. Matcha owns its light and
dark surface ladders, content hierarchy, status and categorical selections,
syntax colors, color-bearing shadows, and existing component mappings. Portable
token vocabulary remains owned by `architecture:theme-tokens`.

## Theme-local role definitions

Matcha defines no public theme-local token names. Its package-specific decisions
use existing portable tokens and component mapping slots.

## Tonal palette definitions

Matcha owns complete private light and dark ramps for neutral, red, orange,
yellow, green, teal, cyan, blue, purple, and pink. The committed request,
generated module, and receipt reproduce the accepted `astryx-oklch-v1` result.
Tea Gold uses seed `#E8B800`, no hard anchors, and a smooth monotonic progression
in both modes.

Palette generation is explicit maintenance work and never runs during a normal
theme build.

## Component and state mappings

Matcha maps existing semantic, categorical, syntax, and color-bearing effect
roles to named Matcha palette stops. Component states keep their existing
meanings and structure. Components consume semantic tokens rather than the
complete palette.

Matcha defines no additional component states or data-visualization colors.

## Compatibility and migration

Matcha exposes no complete generated palette through its package root. The full
palette remains private to authoring, mapping, tests, and review tooling.

Consumers can extend `matchaTheme` and override color, syntax, shadow, and
component values while preserving the released package contract.

## Accessibility and contrast evidence

Matcha-specific mapping and rendered-component evidence covers light and dark
semantic and categorical states. A palette stop alone is not an accessibility
claim; contextual component evidence remains authoritative.

Known normal-text exceptions in the maintained mappings are:

- light secondary body text at 16px is 3.83:1 on the body; typographic role and
  placement distinguish it from primary content;
- light success, warning, and error Banner descriptions and FieldStatus text are
  4.58:1, 5.01:1, and 4.73:1 when their translucent fills are composited over
  white. Over the light body `#f0f0e0`, the same pairs are 4.03:1, 4.42:1, and
  4.14:1. The status icon, title, and written description identify each state
  independently of color;
- light Green, Orange, Pink, Red, and Yellow categorical text is respectively
  4.21:1, 4.03:1, 4.94:1, 4.14:1, and 2.41:1 when each translucent tint is
  composited over white. Over the light body `#f0f0e0`, the same pairs are
  3.73:1, 3.57:1, 4.37:1, 3.64:1, and 2.15:1. These pairings appear in 13px
  Badge and Token labels and normal-sized Card content, where the written
  category and component form remain independent cues; and
- syntax text at 16px is below 4.5:1 for light comments and operators (3.83:1),
  light properties (4.27:1), and dark comments (3.90:1). Source text and grammar
  remain available without relying on color.

This list covers root body text, inherited semantic Badges and Buttons, Banner
descriptions, FieldStatus, categorical Badge/Token/Card content, and every syntax
role rendered by the maintained Matcha mapping. Disabled text is excluded because
genuinely disabled controls are exempt from minimum text contrast.

## Build and artifact contract

The package and CLI template resolve to the same reviewed palette values and
runtime mappings. Runtime JavaScript and CSS contain only the selected values the
theme consumes, never the complete private candidate. Authoring source and
unexported declaration metadata may retain the complete palette.
Verification fails when package and template output diverge or a selected value
is stale or missing. The source import guard fails when the maintained theme
source imports a relative module other than its icon registry or selected
palette projection.

Normal package builds consume committed values and never regenerate palettes.

## Verification map

| Theme contract          | Evidence                                             | Representative states                  | Failure signal                                                                         |
| ----------------------- | ---------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| Palette identity        | Config, generated module, receipt, reproduction test | light and dark; every family           | Regeneration changes accepted values or stable provenance.                             |
| Tea Gold ramp           | Palette tests and rendered palette                   | light and dark; all stops              | A hard stop, non-monotonic step, or hue break appears.                                 |
| Role mapping            | Matcha mapping and theme tests                       | semantic, categorical, syntax, effects | A maintained role bypasses selected Matcha references.                                 |
| Runtime boundary        | Source import guard                                  | maintained theme source                | A relative import other than the icon registry or selected palette projection appears. |
| Package/template parity | Byte comparison and build                            | package and CLI template               | Copies diverge.                                                                        |

## Decision log

### DEC-1 — Matcha owns one reproducible mode-aware palette

**Reference:** `theme:matcha/DEC-1`
**Decider:** `rubyycheung`, `2026-10-17`

Matcha keeps its tea-green neutral identity, natural categorical colors, and
warm Tea Gold in complete private light and dark ramps. Request, generated
result, receipt, and visual evidence change together.

Rejected: inheriting another theme's palette or regenerating values during
normal builds.

### DEC-2 — Tea Gold remains a smooth unanchored ramp

**Reference:** `theme:matcha/DEC-2`
**Decider:** `rubyycheung`, `2026-10-17`

Tea Gold uses seed `#E8B800` at vibrancy 80 without exact anchors. Light and dark
ramps remain monotonic and avoid visible hard stops.

Rejected: exact anchors that introduce abrupt Gold transitions.

### DEC-3 — Existing roles use selected Matcha palette references

**Reference:** `theme:matcha/DEC-3`
**Decider:** `rubyycheung`, `2026-10-17`

Matcha's semantic, categorical, syntax, and color-bearing effect values use
named Matcha palette stops. Alpha variants derive from selected stops, and
mappings preserve role intent rather than applying blind nearest-color matches.

Rejected: adding data-visualization overrides or letting components consume the
complete private palette.

### DEC-4 — Runtime references are deterministic and minimal

**Reference:** `theme:matcha/DEC-4`
**Decider:** `rubyycheung`, `2026-10-17`

The maintained Matcha runtime and the CLI-generated theme resolve to the same
reviewed selected palette values. Runtime JavaScript and CSS omit the complete
private candidate. Unexported authoring declarations may retain it, and normal
builds consume committed values without regenerating the palette.

Rejected: exporting the complete private palette at runtime or allowing package
and generated-template mappings to diverge.

## Open questions

- **OQ1 — Cross-theme contrast methodology** (`human-design`): Which current
  design record owns the human visual and accessibility methodology used to
  judge token and color pairings? No current design record owns this dependency;
  Matcha owns only its theme-specific pairings, exceptions, and measured evidence.

## Content boundary

This record owns Matcha's intent, selected token and palette mappings, required
states, theme-specific exceptions, measured receipts, known gaps,
compatibility, artifacts, and evidence. Shared generation mechanics and token
vocabulary belong to architecture and tooling. Component behavior belongs to
component or family records. Consumer syntax belongs to consumer documentation.
