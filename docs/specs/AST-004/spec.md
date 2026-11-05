---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-004
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
phase: accepted
owners: [cixzhang, imdreamrunner]
affects_architecture:
  [
    architecture:component-theming-surface,
    architecture:icon-resolution-and-component-slots,
  ]
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Selector empty indicator-space collapse system spec

## Intent

Give unselected options the width currently consumed by an empty selection-mark
column. A person should not lose label space to an indicator that draws nothing.
The selected row may therefore shift or truncate earlier when its mark appears;
that difference is an accepted part of the selection state.

This spec records an approved future change. `component:Selector` remains the
source of truth for shipped behavior until the implementation and verification
below land and that current contract is updated in the same pull request.

## Non-goals

- Implementing the runtime change in this specification pull request.
- Adding a public prop to preserve or select indicator-column reservation.
- Removing `indicatorPosition` or changing its default logical edge.
- Hiding an unselected indicator that a theme intentionally renders, such as an
  unchecked radio replacement.
- Changing selection, keyboard, loading, adaptive presentation, Popover,
  BottomSheet, or listbox/dialog semantics.
- Establishing an input-family or selection-family layout rule.

## Requirements

- **FR1 — Empty indicator space collapses.** An unselected option whose resolved
  selection indicator draws no content MUST NOT reserve an empty indicator
  column.
- **FR2 — Rendered indicators keep their space.** A selected mark and any themed
  replacement that renders an unselected state MUST remain in row layout at the
  configured `indicatorPosition`.
- **FR3 — State-dependent width is intentional.** When only the selected row
  renders a mark, its label may start at a different inline position or have less
  available width than an unselected label. The implementation MUST preserve
  readable row content and existing overflow behavior rather than compensating
  with blank space.
- **FR4 — Logical placement still applies.** `indicatorPosition="start"` and
  `"end"` MUST place each rendered mark at that logical edge in both LTR and RTL.
- **IR1 — Derive layout from rendered content.** The component MUST determine
  whether space exists from the resolved indicator output; it MUST NOT add a new
  public reservation or alignment prop.
- **IR2 — Preserve theme replacement.** The change MUST continue resolving the
  indicator through the current theme-owned indicator path, including selected
  and unselected states.
- **IR3 — Preserve semantic ownership.** Collapsing visual space MUST NOT change
  option roles, `aria-selected`, listbox ownership, trigger relationships, or
  which element carries the stable `selector-check` theme target.

### Platform support

- Supported feature/engine floor: all browsers supported by Astryx Core.
- Unsupported behavior: none; the layout MUST use the existing cross-browser CSS
  and React support floor.
- Browser evidence: real Chromium verifies rendered spacing and truncation. RTL
  and compact-width cases are required; DOM structure or jsdom alone is not
  visual evidence.

## Current-state impact

Current `main` intentionally renders an indicator wrapper for every option and
applies a minimum inline width to that wrapper. The default unchecked check
indicator draws nothing, so unselected rows still reserve blank space. Existing
`Selector.test.tsx` coverage explicitly asserts two row children at both
indicator positions.

Implementation changes `component:Selector/FR3` and its mapped tests. It remains
bounded by the current systems Selector already uses:

- `architecture:component-theming-surface` continues to own stable theme targets;
- `architecture:icon-resolution-and-component-slots` continues to own resolved
  indicator replacement and stateful rendering;
- `architecture:interaction-modality` and `architecture:layer-runtime` remain
  unchanged; pointer Popover and touch modal-dialog behavior are not part of this
  layout change; and
- `architecture:public-component-api` continues to prohibit exposing a derivable
  layout difference as a new caller-controlled prop.

### Implementation requirements

1. Collapse the mark wrapper only when the resolved indicator renders no content.
2. Preserve layout space for the selected default check and for themed indicators
   that render an unselected state.
3. Replace the current reserved-column assertion with focused coverage for empty
   collapse and rendered replacement indicators at both logical positions.
4. Update `component:Selector` in the implementation pull request so its current
   requirements and verification map describe the shipped result.
5. Add stable real-browser visual regression coverage before this spec moves to
   `shipped`.

## Verification

| Contract      | Verification                                     | Representative states                                                                    | Mutation or failure expectation                                                                    |
| ------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| FR1, FR3      | Focused `Selector.test.tsx` layout assertions    | default check; selected and unselected rows; narrow long labels                          | An empty wrapper keeps width, or selected-state truncation is masked by restored blank spacing     |
| FR2, IR2      | Indicator replacement tests                      | default check and themed radio; checked and unchecked                                    | Unselected themed output disappears or loses its layout space                                      |
| FR4           | Logical-order tests and real-browser screenshots | `start`/`end`; LTR/RTL; selected/unselected                                              | A rendered mark appears on the physical rather than logical edge                                   |
| IR1, IR3      | Public-surface, role, and theme-target tests     | default and custom option rendering; search/non-search                                   | A new public prop appears, option/listbox semantics change, or the stable target moves             |
| Visual result | Stable visual regression in real Chromium        | pointer Popover and touch modal dialog; narrow/wide; start/end; default/themed indicator | Empty space remains, visible indicators overlap, or selected/unselected content becomes unreadable |

### Completion criteria

This spec moves from `accepted` to `shipped` only when:

- empty default-check wrappers consume no indicator-column width;
- selected marks and visible unselected theme replacements retain their required
  space at both logical positions in LTR and RTL;
- selected-row shift and narrower available width are covered as intentional
  behavior, including long-label truncation;
- focused unit and real-browser visual regressions cover pointer Popover and
  touch modal-dialog presentations without changing their semantics; and
- `component:Selector` is updated from the reserved-column baseline to the new
  shipped behavior in the same pull request.

## Decision log

### DEC-1 — Unselected rows collapse empty indicator space

**Reference:** `spec:AST-004/DEC-1`
**Decider:** `cixzhang`, `2026-08-30`

An unselected Selector option does not reserve blank space when its resolved
selection indicator draws nothing. This gives unselected labels more usable
width. A selected label may shift or truncate earlier when its indicator appears;
that state difference is intentional.

Rejected: reserving an empty column on every row solely to keep selected and
unselected labels aligned. That alignment spends content width on an absent
visual and makes the unselected state less useful.

## Open questions

None.
