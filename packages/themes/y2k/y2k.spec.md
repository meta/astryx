---
schema_version: 2
template_version: 2
kind: theme
id: theme:y2k
authority: current
approved_by: rubyycheung
approved_at: 2026-10-17
review_triggers:
  [tokens, palette-values, component-mappings, contrast, artifacts]
verified_by:
  [
    packages/themes/y2k/src/y2kTheme.test.ts,
    packages/themes/y2k/src/y2kColorMapping.test.ts,
    packages/themes/y2k/src/y2kPalettes.test.ts,
    scripts/generate-y2k-palette-refs.test.mjs,
  ]
package: '@astryxdesign/theme-y2k'
source_theme: packages/themes/y2k/src/y2kTheme.ts
references:
  [
    architecture:theme-authoring-contract,
    architecture:theme-tokens,
    architecture:theme-compilation,
  ]
---

# Y2K theme specification

## Intent and audience

Y2K is a playful high-chroma theme with signature Periwinkle, Neon Green, airy
Electric Blue, and bright pastel categorical colors. It serves expressive
interfaces that want digital-pop character while retaining semantic hierarchy
in light and dark modes.

## Inheritance and base

Y2K starts from Astryx core defaults and overrides selected typography, spacing,
motion, radius, shadow, semantic color, syntax, icon, and component values. It
does not extend another published package theme.

## Portable token overrides

The exact maintained values live in `source_theme`. Y2K owns its light and dark
surface ladders, signature accents, status and categorical selections, syntax
colors, color-bearing shadows, and existing component mappings. Portable token
vocabulary remains owned by `architecture:theme-tokens`.

## Theme-local role definitions

Y2K defines no public theme-local token names. Its package-specific decisions
use existing portable tokens and component mapping slots.

## Tonal palette definitions

Y2K owns complete private light and dark ramps for neutral, accent, blue, cyan,
green, orange, pink, purple, red, teal, and yellow. Its light neutral keeps the
warm canvas, while the dark neutral follows the navy dark surfaces from `#0E0F1A`
toward lavender `#EDEFFC`. The committed request, generated module, and receipt
reproduce the accepted `astryx-oklch-v1` result.

Accent Light 80 is exact Periwinkle `#CCCFFA`. Green Light and Dark 80 are exact
Neon Green `#C5E17A`. Electric Blue is anchorless; mapped Blue roles use Surface
85 `#ADDBFF`, Border 75 `#70C1FF`, and foreground 20 `#003454`.

Palette generation is explicit maintenance work and never runs during a normal
theme build.

## Component and state mappings

Y2K maps existing semantic, categorical, syntax, and color-bearing effect roles
to named Y2K palette stops. Neon Green supplies both success and Green category
roles. Electric Blue keeps airy surfaces while increasing saturation. Components
consume semantic tokens rather than the complete palette.

Y2K defines no additional component states or data-visualization colors.

## Compatibility and migration

The released `y2kPalettes` object remains byte-identical in its established
package export. Complete mode-aware ramps remain private to authoring, mapping,
tests, and review tooling.

Consumers can extend `y2kTheme` and override color, syntax, shadow, and component
values while preserving the released package contract.

## Accessibility and contrast evidence

Y2K-specific mapping and rendered-component evidence covers light and dark
semantic and categorical states. A palette stop alone is not an accessibility
claim; contextual component evidence remains authoritative.

The known light-mode text exception is secondary text
(`--color-text-secondary`) on the Periwinkle body
(`--color-background-body`), which measures 4.25:1.

The dark neutral border audit suppresses each border and checks whether another
visible cue still identifies the component or state:

| Component or state                                   | Border role and removal result                                                                                                                                                                    | Requirement and result                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Resting Selector, text input, and InputGroup members | Without the emphasized border, the input surface is only 1.09:1 against the body and the editable or selectable boundary becomes materially less identifiable.                                    | The boundary is necessary. Neutral Dark 45 `#636889` measures 3.23:1 on the `#16182B` input surface. |
| Unchecked Checkbox and Radio                         | Without the emphasized outline, the empty control disappears into its surface and leaves only the adjacent label and spacing; those cues do not identify the unchecked control's shape or target. | The outline is necessary and uses the same passing 3.23:1 Neutral Dark 45 pairing.                   |
| Checked or indeterminate Checkbox and Radio          | Accent fill plus the check, bar, or radio dot independently identifies the state.                                                                                                                 | The low neutral border is not the state cue; the accent treatment remains authoritative.             |
| Decorative container edges using `--color-border`    | Removing the edge does not erase a control or state; fill, content, spacing, grouping, or elevation still identifies the surface.                                                                 | The inherited 1.31:1 dark default border is decorative and is not required to meet 3:1.              |
| Disabled controls                                    | Their reduced treatment is not used to identify an available interaction.                                                                                                                         | WCAG's inactive-component exception applies.                                                         |

Focus and semantic-status states continue to use their dedicated accent or status
rims and visible icons or text rather than the resting neutral border alone.

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
| Signature colors        | Palette and mapping tests                            | Periwinkle; Neon Green; Electric Blue  | An exact anchor or approved mapped Blue value moves.              |
| Role mapping            | Y2K mapping and theme tests                          | semantic, categorical, syntax, effects | A maintained role bypasses selected Y2K references.               |
| Public compatibility    | Legacy object test and package build                 | keys and every released value          | The released object differs from its established shape or values. |
| Package/template parity | Byte comparison and build                            | package and CLI template               | Copies diverge.                                                   |

## Decision log

### DEC-1 — Y2K owns one reproducible mode-aware palette

**Reference:** `theme:y2k/DEC-1`
**Decider:** `rubyycheung`, `2026-10-17`

Y2K keeps its Periwinkle canvas, Neon Green, airy Electric Blue, and digital-pop
categorical identity in complete private light and dark ramps. Request,
generated result, receipt, and visual evidence change together.

Rejected: inheriting another theme's palette or regenerating values during
normal builds.

### DEC-2 — Periwinkle and Neon Green remain exact

**Reference:** `theme:y2k/DEC-2`
**Decider:** `rubyycheung`, `2026-10-17`

Accent Light 80 remains `#CCCFFA`. Green Light and Dark 80 remain `#C5E17A` and
supply both Neon Green category and success roles.

Rejected: approximating either signature color with an unanchored stop.

### DEC-3 — Electric Blue stays airy and saturated

**Reference:** `theme:y2k/DEC-3`
**Decider:** `rubyycheung`, `2026-10-17`

Electric Blue remains anchorless. Surface roles use stop 85 `#ADDBFF`, borders
use stop 75 `#70C1FF`, and dark foreground roles use stop 20 `#003454` so Blue
stays bright without becoming a dark block.

Rejected: moving Blue surfaces to stop 80 or lower.

### DEC-4 — Existing roles use selected Y2K palette references

**Reference:** `theme:y2k/DEC-4`
**Decider:** `rubyycheung`, `2026-10-17`

Y2K's semantic, categorical, syntax, and color-bearing effect values use named
Y2K palette stops. Alpha variants derive from selected stops, and mappings
preserve role intent rather than applying blind nearest-color matches.

Rejected: adding data-visualization overrides or letting components consume the
complete private palette.

### DEC-5 — The released palette object stays compatible

**Reference:** `theme:y2k/DEC-5`
**Decider:** `rubyycheung`, `2026-10-17`

`y2kPalettes` keeps its released shape and values. Complete mode-aware ramps
remain private authoring data.

Rejected: forcing existing consumers onto the generated palette shape.

### DEC-6 — Runtime references are deterministic and minimal

**Reference:** `theme:y2k/DEC-6`
**Decider:** `rubyycheung`, `2026-10-17`

Y2K's selected-reference module contains exactly the family, mode, and stop
values referenced by the maintained theme. Write mode synchronizes package and
CLI-template outputs; check mode compares the complete projection without
writing.

Rejected: bundling the complete private palette or maintaining a manual
selection manifest.

## Open questions

- **OQ1 — Shared non-text contrast applicability** (`human-design`): Which
  current design record owns the cross-theme suppression method and independent
  cue rule? Y2K owns only the component/state matrix, measured pairings, and
  theme mappings above; applying the method to other themes waits on a current
  global authority.

## Content boundary

This record owns Y2K's intent, selected token and palette mappings, required
states, theme-specific exceptions, measured receipts, known gaps,
compatibility, artifacts, and evidence. Shared generation mechanics and token
vocabulary belong to architecture and tooling. Component behavior belongs to
component or family records. Consumer syntax belongs to consumer documentation.
