---
schema_version: 2
template_version: 2
kind: theme
id: theme:glass
authority: draft
approved_by: null
approved_at: null
review_triggers:
  [tokens, palette-values, component-mappings, contrast, artifacts]
verified_by:
  [
    packages/themes/glass/src/glassTheme.test.ts,
    scripts/generate-glass-palette-refs.test.mjs,
    scripts/check-badge-contrast.test.mjs,
    scripts/check-muted-status-contrast.test.mjs,
    scripts/check-status-text-contrast.test.mjs,
    scripts/check-syntax-punctuation-contrast.test.mjs,
  ]
package: '@astryxdesign/theme-glass'
source_theme: packages/themes/glass/src/glassTheme.ts
references:
  [
    architecture:theme-authoring-contract,
    architecture:theme-tokens,
    architecture:theme-compilation,
  ]
---

# Glass theme specification

## Intent and audience

Glass is a dark-only theme for dashboards and data-dense apps. A deep navy
canvas carries two soft color glows on the app shell. Cards are glass: a cool
tint that fades from the top-left corner, a translucent edge, and a light top
edge. A colored card (`<Card variant="<hue>">`) takes one vivid hue, and the
charts, progress bars, links, and focus rings inside it follow that hue.

## Inheritance and base

Glass starts from Astryx core defaults and does not extend another published
package theme. It sets every color token whose core default differs by mode,
so it renders one dark appearance whatever the system color preference. Its
typography, motion, radius steps other than the container, and icon registry
have Neutral's values, and Glass carries them in its own source.

## Portable token overrides

The exact maintained values live in `source_theme`. Glass owns its navy surface
ladder, content hierarchy, blue accent (`blue.dark[70]`, `#6ea8ff`), status
selections, categorical hues, the data colors that match those hues, its
shadow rims, and a 1.25rem `--radius-container`. Portable token vocabulary
remains owned by `architecture:theme-tokens`.

Each status uses the matching hue: info is blue, success is green, warning is
yellow, and error is red. A strong status fill is the hue's line stop (70) with
navy text (`neutral.dark[5]`). Status text and the content on a pale status
fill use the hue's text stop (85). A pale status fill is the hue's tint stop
(60) at partial alpha.

## Theme-local role definitions

Glass defines no public theme-local token names. Its package-specific decisions
use existing portable tokens and component mapping slots.

## Tonal palette definitions

Glass owns complete private dark ramps for a navy neutral and for blue, cyan,
green, orange, pink, purple, red, teal, and yellow. The committed request,
generated module, and receipt reproduce the accepted `astryx-oklch-v2` result.
Exact anchors keep the navy surface ladder (stops 5, 10, 15, 20, 30, 60, 75,
85, 95) and, for each hue, its tint (60), line (70), and text (85) colors.
The gray hue uses navy stops 75 and 85.

Palette generation is explicit maintenance work and never runs during a normal
theme build.

## Component and state mappings

- **App shell.** The shell paints the navy body with a purple glow at the top
  right and a cyan glow at the bottom left. The layout content pane is
  transparent, so the glows show behind page content. In the elevated layout
  with both a top nav and a side nav, the side nav, its layout panel, and the
  content backdrop paint opaque surfaces over the glows.
- **Card.** A card has 16px padding (`--spacing-4`), the glass tint, a
  translucent blue edge, a light top edge, and a soft drop shadow.
- **Hued card.** `variant:<hue>` keeps the card surface and paints the hue's
  tint from the top-left corner, the hue's border, and a top edge in the hue's
  text color. It sets `--color-accent` to the hue's line color and
  `--color-text-accent` and `--color-icon-accent` to the hue's text color for
  its subtree.
- **Control edges.** The `field`, `checkbox-indicator`, and `radio-indicator`
  targets set `--color-border-emphasized` to `blue.dark[80]` at 60% alpha for
  their subtree, so every field shell, checkbox, and radio box edge holds 3:1.
  Other emphasized borders keep the lighter global value.
- **Badges.** Each badge variant uses the matching hue's tint and text.
- **Tinted fills.** Selected list and tree rows, the dropzone, numbered
  citations, and segmented-control labels lift secondary text to
  `neutral.dark[80]`.
- **Tracks.** Switch and progress-bar tracks use the emphasized border color,
  because the translucent tints are too faint for a track.

Glass defines no additional component states.

## Compatibility and migration

Glass exports `glassTheme` and `glassIconRegistry`. The generated palette is
private authoring data. Consumers can extend `glassTheme` and override color,
shadow, and component values.

## Accessibility and contrast evidence

Glass applies WCAG 2.2 AA: 4.5:1 for text and 3:1 for focus rings, control
edges, and borders. Translucent layers are composited over their opaque
surface. A hued card is measured at its top-left corner, where its tint is
strongest. The theme test asserts every pairing below.

| Pairing                                | Surfaces or hues           | Lowest measured |
| -------------------------------------- | -------------------------- | --------------- |
| Primary text                           | body, card, popover, muted | 14.69:1         |
| Secondary text                         | body, card, popover, muted | 6.61:1          |
| Accent text                            | body, card, popover, muted | 9.70:1          |
| Focus ring (`--color-accent`)          | body, card, popover, muted | 6.85:1          |
| Control edge                           | body, card, popover, muted | 3.99:1          |
| Text on the accent fill                | accent                     | 8.19:1          |
| Primary text, plain card corner        | card                       | 13.54:1         |
| Secondary text, plain card corner      | card                       | 6.10:1          |
| Focus ring, plain card corner          | card                       | 6.32:1          |
| Control edge, plain card corner        | card                       | 3.81:1          |
| Hue text on its tint                   | every hue, every surface   | 7.06:1 (red)    |
| Primary text, hued card corner         | every hue                  | 10.63:1         |
| Secondary text, hued card corner       | every hue                  | 4.78:1 (yellow) |
| Accent text, hued card corner          | every hue                  | 7.65:1 (red)    |
| Hue focus ring, hued card corner       | every hue                  | 5.18:1 (purple) |
| Control edge, hued card corner         | every hue                  | 3.28:1 (yellow) |
| Hue border against the body and card   | every hue                  | 3.54:1 (red)    |
| Hue border against its own card corner | every hue                  | 3.20:1 (red)    |

Disabled text and icons (`neutral.dark[60]`) are exempt from these floors.
Status, badge, muted status, and syntax pairings are held by the shared
first-party theme contrast tests in `verified_by`.

## Build and artifact contract

The package and the CLI template carry identical palette requests, generated
candidates, receipts, selected-reference modules, and theme sources. The
selected-reference module is deterministically derived from `source_theme` and
the committed private palette. A non-writing check fails for missing, extra,
stale, or invalid references. Normal package builds consume committed
references and never regenerate palette values. The built theme CSS contains no
`light-dark()`.

## Verification map

| Theme contract          | Evidence                                             | Representative states                  | Failure signal                                               |
| ----------------------- | ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------ |
| Dark palette identity   | Config, generated module, receipt, reproduction test | every family and stop                  | Regeneration changes accepted values or stable provenance.   |
| Role mapping            | Glass theme test                                     | surfaces, text, categorical hues       | A root color is not a Glass palette value.                   |
| Mode contract           | Glass theme test; theme CSS                          | light and dark resolution              | A color or shadow token differs between light and dark mode. |
| Contrast                | Glass theme test; shared contrast tests              | every surface; every hue; card corners | A pairing in the table falls below its floor.                |
| Package/template parity | CLI theme bundle test and build                      | package and CLI template               | Copies diverge.                                              |

## Decision log

### DEC-1 — Glass owns one reproducible dark-only palette

**Reference:** `theme:glass/DEC-1`

Glass keeps its navy canvas and vivid card hues in complete private dark ramps
with exact anchors. Request, generated result, receipt, and visual evidence
change together.

Rejected: a light mode, because the glass treatment depends on a dark canvas.

### DEC-2 — Glass stands alone

**Reference:** `theme:glass/DEC-2`

Glass extends no other package theme. It carries the typography, motion, radius
steps, and icons it shares with Neutral as its own values, so a Neutral change
does not change Glass.

Rejected: `extends: neutralTheme`, because Neutral's mode-dependent values would
leak into Glass's single mode.

### DEC-3 — A hued card re-points its accent

**Reference:** `theme:glass/DEC-3`

A hued card sets `--color-accent`, `--color-text-accent`, and
`--color-icon-accent` for its subtree. Components inside the card then draw
their accent in the card's hue with no page change.

### DEC-4 — Controls take a stronger edge than other emphasized borders

**Reference:** `theme:glass/DEC-4`

Field shells, checkboxes, and radio boxes take a 3:1 edge through the `field`,
`checkbox-indicator`, and `radio-indicator` targets. Other emphasized borders
keep a lighter edge, which keeps the glass look.

Rejected: raising the global `--color-border-emphasized` to 3:1, because every
emphasized border would brighten with it.

## Open questions

- **OQ1 — Cross-theme contrast methodology** (`human-design`): Which current
  design record owns the human visual and accessibility methodology used to
  judge token and color pairings? No current design record owns this
  dependency; Glass owns only its theme-specific pairings and measured evidence.
- **OQ2 — Accent scope in a hued card** (`human-design`): Does the portable
  token contract allow a component mapping to re-point `--color-accent` and
  its text and icon roles for a subtree (DEC-3)? If it does not, a hued card
  keeps the page accent and only its surface takes the hue.
- **OQ3 — Control edge role** (`human-engineering`): Which role carries the
  control edge? Core components read `--color-border-emphasized` for field,
  checkbox, and radio edges, so Glass holds them at 3:1 through three target
  overrides (DEC-4). The other option is one `--color-border-control` value
  under `architecture:theme-tokens` INV13; Core components do not read that
  token.

## Content boundary

This record owns Glass's intent, selected token and palette mappings, required
pairings and states, theme-specific exceptions, measured receipts, known gaps,
compatibility, artifacts, and evidence. A current cross-theme design record owns
human contrast methodology; shared measurement and tool implementation belong to
architecture or tooling. Cross-theme APIs belong to separate architecture or
system specs. Component behavior belongs to component or family records.
Consumer syntax and examples belong to consumer docs.
