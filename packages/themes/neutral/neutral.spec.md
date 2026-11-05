---
schema_version: 2
template_version: 1
kind: theme
id: theme:neutral
authority: current
approved_by: rubyycheung
approved_at: 2026-10-17
review_triggers:
  [tokens, palette-values, component-mappings, contrast, artifacts]
verified_by: [scripts/check-badge-contrast.test.mjs]
package: '@astryxdesign/theme-neutral'
source_theme: packages/themes/neutral/src/neutralTheme.ts
references:
  [
    architecture:theme-authoring-contract,
    architecture:theme-tokens,
    architecture:theme-compilation,
    architecture:component-theming-surface,
    spec:AST-006,
  ]
---

# Neutral theme specification

This record is the current approved palette and Neutral token-mapping record.
It does not decide cross-theme local-token, palette-generation, compiler, or
artifact APIs; current `spec:AST-006` owns the accepted local-token contract.
DEC-2 ratifies the exact palette shipped by this change, and DEC-4 ratifies the
reviewed Neutral token mappings shipped with it. Proposed local-token roles and
additional component mappings remain separate work and must not be treated as
an approved public contract.

## Intent and audience

Neutral serves builders who want a quiet grayscale foundation with restrained
surfaces and distinguishable semantic and categorical color. It should remain
product-neutral while status and interaction states stay recognizable in both
color modes.

## Inheritance and base

Neutral starts from Astryx core defaults and overrides selected typography,
motion, radius, shadow, semantic color, syntax, icon, and component values. It
does not currently extend another published package theme.

## Portable token overrides

The exact shipped values remain in `source_theme`. Neutral owns its grayscale
canvas/surface hierarchy, near-black/near-white content roles, status and
categorical selections, neutral boundaries, and syntax choices. Cross-theme token
vocabulary remains owned by `architecture:theme-tokens`.

## Theme-local role definitions

Neutral emits one theme-local role, kept as a compatibility contract for
Neutral extensions. It is deprecated: Neutral paints every status through the
portable `--color-*` roles and does not read it, and it keeps its exact name,
meaning, and value:

| Exact name                                        | Neutral-only meaning | Value                    | Status     |
| ------------------------------------------------- | -------------------- | ------------------------ | ---------- |
| `--astryx-theme-neutral-color-status-fill-accent` | Filled accent status | `['#0074e2', '#6d9cfe']` | Deprecated |

Core components consume the portable `--color-*` semantic roles; no Core
implementation or Neutral mapping depends on this alias.

## Tonal palette definitions

Candidate source work contains complete light and dark ramps for neutral, red,
orange, yellow, green, teal, cyan, blue, purple, and pink. The committed request,
generated module, and receipt make the reviewed `astryx-oklch-v1` result
reproducible. Draft `spec:AST-018` separately owns the cross-theme authoring and
validation contract. Regeneration is an explicit reviewed palette change and
never occurs during a normal theme build. Mapping runtime tokens to these stops
is reviewed in a separate stacked change.

The approved dark-mode adjustment reduces realized chroma to 50% through stop
25 for chromatic families, with a 65% family override for yellow, and recovers
smoothly to the standard recipe at stop 60. It leaves the light ramps, neutral
ramps, and stops 60 through 100 unchanged. It does not use opacity or change
tone coordinates.

## Component and state mappings

Core components choose semantic roles by surface (`architecture:theme-tokens`
INV11): strong fills use `--color-<status>` with `--color-on-<status>`, pale
surfaces use `--color-<status>-muted` with `--color-on-<status>-muted`, and
status text, icons, and borders on the default surfaces use `--color-text-*`,
`--color-icon-*`, and `--color-border-*`. Neutral sets the portable status
fills directly: `--color-info` `['#0074e2', '#6d9cfe']`, `--color-success`
`['#198100', '#64af4c']`, `--color-warning` `'#ffce2f'`, and `--color-error`
`['#c9303a', '#ff705d']`, the colours its Badges have always shown. Accent
variants of ProgressBar, StatusDot, and Stepper indicators paint Neutral's
accent, and Banner and the pale destructive Button use the portable overlay
and neutral roles; Neutral adds no component override for any of them. Every new mapping needs exact-head theme review and
rendered light/dark evidence; shared color alone is not enough.

This work does not add component states. It intentionally excludes
`table-row-status`, which has no approved theming target, and SegmentedControl
geometry/shadow changes, which are reviewed independently.

## Compatibility and migration

This record documents the package output shipped by the current Neutral change.
Existing Neutral authoring and portable token names remain stable while the
reviewed mappings are emitted through the runtime theme and CLI template.
Neutral explicitly supplies `localTokens`; the exact names and meanings are
therefore part of its public compatibility contract.

Implementation requires the parent AST-006 implementation to ship first,
followed by complete rendered evidence and exact-head approval for every
proposed value and mapping. When Neutral ships a definition, its exact name and
approved semantic meaning become a public compatibility contract of the Neutral
family. A local-token name, enrolled theme name, or semantic meaning change must
preserve descendants and consumers through an explicit reviewed migration or
alias. Compiled CSS does not broaden a role beyond its approved contexts.

## Accessibility and contrast evidence

A current cross-theme design record for contrast methodology does not yet exist,
so this draft does not select or restate a methodology. The future record is an
unresolved dependency and therefore is not listed in frontmatter.

Current Neutral-specific receipts include the Badge contrast check and pairings
documented beside Neutral source. The candidate accent fill uses `#0074e2` in
light mode and `#6d9cfe` in dark mode, but those values are not an accessibility
claim by themselves. Adoption requires the actual Badge informational foreground
and background pairing to meet its threshold in rendered light and dark states;
every later mapping needs receipts for its foreground, graphical-object,
interaction, and disabled states. No palette stop is accessible by itself, and
color cannot replace another signal required by the component contract. This
record will own those pairings, exceptions, measurements, and known gaps after
the shared methodology is current; it will not copy the methodology or shared
measurement-tool implementation.

## Build and artifact contract

The package manifest and build tests define Neutral's runtime, CSS, declaration,
and export outputs. The complete palette remains in a theme-owned source file
for authoring and audits, while the generated selected-stop references used by
`defineTheme` are included in the runtime and CLI template artifacts. The
complete authoring palette is not bundled into generated CSS or generic
theme-build artifacts.

The selected-stop module is a deterministic derived artifact. A checked-in,
explicit maintenance command MUST discover every palette family, mode, and stop
referenced by Neutral's theme source, resolve each one from the committed full
palette, and regenerate the selected-stop module without changing token mappings.
A non-writing check MUST compare the complete generated module with the committed
file and fail on missing, extra, stale, or invalid references. Theme verification
MUST fail when the committed module differs from this deterministic projection.
Normal theme builds MUST NOT regenerate or adopt palette values.

The selected-stop module MUST contain exactly the palette stops referenced by
Neutral's theme source. Removing an unreferenced private entry preserves every
referenced value, the complete authoring palette, all token mappings, rendered
output, and public APIs.

## Verification map

| Theme contract            | Evidence                                            | Representative states                                          | Failure signal                                                                                                 |
| ------------------------- | --------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Current value inventory   | Neutral source and theme tests                      | light/dark token families                                      | Source and record disagree about a theme-owned meaning.                                                        |
| Local role contract       | Planned AST-006 implementation and Neutral fixtures | exact declaration/use/output name; public meaning; rename      | The shipped name or meaning changes without reviewed compatibility handling, or leaks into portable/Core APIs. |
| Component mappings        | Theme-spec review and rendered evidence             | Badge info; each future mapping; light/dark; interaction state | A mapping does not genuinely mean filled accent status or lands without contextual evidence.                   |
| Contrast                  | Badge check plus rendered component matrix          | light/dark and interactive states                              | A required pairing falls below its threshold.                                                                  |
| Selected runtime refs     | Deterministic regeneration plus exhaustive parity   | every referenced family, mode, and stop                        | A generated reference is missing, extra, invalid, or differs from the committed full palette.                  |
| Existing package contract | Theme build, package, and resolution tests          | runtime, CSS, declarations, public exports                     | This record implies an artifact that the package does not ship.                                                |

## Decision log

The decisions below record settled input for the portions they name. DEC-2
approves the exact palette, and DEC-4 approves the reviewed token mappings
shipped by this release. Local-token roles and rendered-evidence questions
remain subject to the specific approval gates stated in their decisions.

### DEC-1 — Own one exact Neutral filled-accent-status role

**Reference:** `theme:neutral/DEC-1`
**System-boundary decider:** `cixzhang`, `2026-08-31`
**Final Neutral adoption decider:** `rubyycheung`, `2026-10-17`

Neutral owns theme-local definitions in this colocated theme spec.
`--astryx-theme-neutral-color-status-fill-accent` represents filled accent
status under the stable `name: 'neutral'`. Its exact name, meaning, and
`['#0074e2', '#6d9cfe']` value are a public Neutral-family
compatibility contract, despite not being portable across themes or consumed by
Core.

The token may be applied only where the mapped context genuinely means filled
accent status. It is deprecated: Neutral itself maps no component to it and
uses the portable status roles instead, and it stays defined for Neutral
extensions. A new component mapping requires rendered light/dark evidence for
its actual interaction states.

Rejected: treating the role as global, treating it as disposable private output,
or applying it merely because two contexts currently share a color.

### DEC-2 — Approve the Neutral palette as a decision anchor

**Reference:** `theme:neutral/DEC-2`

**Decider:** `rubyycheung`, `2026-09-02`

Neutral's exact palette values are approved as the stable starting point for
subsequent color and contrast decisions. The request, generated result, receipt,
and visual review must change together. Runtime token mappings are deliberately
excluded from this decision and reviewed in a separate stacked change. The
complete authoring palette is not added to the runtime theme object or generated
CSS.

Neutral is the repository reference implementation for palette-aware theme
templates. Templates may reuse its ownership, review, and alignment workflow;
they do not inherit Neutral's values, mappings, or stop layout as requirements.

Rejected: regenerating the palette during a normal build, silently changing
runtime token mappings as part of palette generation, or requiring complete
component-level contrast conformance before the palette can serve as the
baseline for measuring and improving those mappings.

### DEC-3 — Mute the dark chromatic edge without changing its tone scale

**Reference:** `theme:neutral/DEC-3`

**Decider:** `rubyycheung`, `2026-09-04`

Neutral's dark chromatic ramps use a 50% realized-chroma multiplier through
stop 25 and recover smoothly to the standard recipe at stop 60. Yellow uses a
65% multiplier to preserve its identity. The adjustment emits solid colors: it
adds no alpha, changes no light or neutral ramp, and preserves exact endpoint
and stop coordinates.

Rejected: reducing the entire palette's vibrancy, using translucent colors, or
changing semantic token mappings in the palette-value change.

### DEC-4 — Map Neutral roles through reviewed palette references

**Reference:** `theme:neutral/DEC-4`

**Decider:** `rubyycheung`, `2026-09-04`

Neutral's semantic, categorical, syntax, and color-bearing effect values use
named palette-stop references when an approved match exists; the status fills,
which keep explicit values, are recorded in DEC-6. Alpha
variants derive from the referenced stop rather than duplicating its hex value.

The mapping is role-aware rather than a blind nearest-color conversion. Very
dark foregrounds preserve their darker role, ordinary backgrounds do not become
true black automatically, and a reviewed token may use the closer value from
the companion ramp. Intentional values without an approved palette match remain
explicit theme-local values.

### DEC-5 — Generate the selected runtime references from their owned sources

**Reference:** `theme:neutral/DEC-5`

**Decider:** `rubyycheung`, `2026-09-30`

Neutral's selected-stop module is generated from two existing sources of truth:
the family, mode, and stop references used by Neutral's theme source, and the exact
values in the committed full palette. Regeneration copies only those selected
values into the runtime artifact. It neither chooses mappings nor regenerates the
full palette.

The generator has an explicit write mode for maintainers and a non-writing check
for verification. The check compares the entire expected artifact, so a missing,
extra, invalid, or stale selected reference fails before package output is
accepted. Normal theme builds never rewrite committed palette source.

Rejected: importing the complete palette at runtime, maintaining a second manual
selection manifest, or treating token-mapping assertions as proof that copied
hex values still match the approved palette.

### DEC-6 — Paint status through the portable roles, with no other local tokens

**Reference:** `theme:neutral/DEC-6`

**Decider:** `cixzhang`, `2026-10-25`

Neutral paints status, tinted surfaces, and the pale destructive Button through
the portable `--color-*` roles. It defines no local token for them other than
the deprecated `--astryx-theme-neutral-color-status-fill-accent` of DEC-1.

This is the `spec:AST-006` FR10 exception for nine local names that earlier
Neutral releases emitted: `--astryx-theme-neutral-color-status-fill-success`,
`-status-fill-warning`, `-status-fill-error`, `-status-muted-accent`,
`-on-tint-neutral`, `-on-tint-overlay-hover`, `-on-tint-overlay-pressed`,
`-destructive-overlay-hover`, and `-destructive-overlay-pressed`. None of them
was a Neutral-family contract: this record listed the first three and the
on-tint names as proposed roles that must not be treated as an approved public
contract, and never documented the others. They therefore carry no alias. Their
replacements are `--color-success`, `--color-warning`, and `--color-error` for
the status fills, `--color-info-muted` for the pale accent surface,
`--color-neutral` for on-tint content, and `--color-overlay-hover` and
`--color-overlay-pressed` for the overlays.

Neutral's `--color-success`, `--color-warning`, and `--color-error` are its
strong status fills under `architecture:theme-tokens` INV11, set to the
explicit colours its Badges have always shown, which no palette stop matches.
Their Neutral values therefore change from the darker colours earlier releases
used, which `--color-text-<status>` now carries for status text on the page.

Rejected: keeping the nine as deprecated aliases, which would preserve names
that were never promised and that Neutral no longer reads.

## Open questions

None.

## Content boundary

This record owns Neutral's intent, factual value inventory, approved local-token
name and meaning, proposed value, selected mappings, required pairings/states,
theme-specific exceptions, measured receipts, known gaps, compatibility, and
package facts. A future current design record owns the cross-theme contrast
methodology; shared measurement implementation belongs to
architecture/tooling. This record does not define cross-theme local-token or
palette APIs. `spec:AST-006` owns the cross-theme local-token API, namespace,
validation, lineage, and compiler invariants. Component/family records own
observable behavior, and consumer docs own supported syntax and examples.
