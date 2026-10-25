---
schema_version: 3
template_version: 3
kind: component
id: component:Selector
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Selector/Selector.test.tsx,
    packages/core/src/Selector/Selector.source-build.test.mjs,
    packages/core/src/Selector/__tests__/Selector.listbox.a11y.test.tsx,
    packages/core/src/Selector/__tests__/Listbox.a11y.chromium.spec.ts,
    packages/core/src/Selector/__tests__/Selector.combobox.a11y.test.tsx,
    packages/core/src/Selector/__tests__/Selector.combobox.a11y.chromium.spec.ts,
    apps/storybook/stories/Selector.stories.tsx,
    .github/scripts/story-play-guard.js,
  ]
modules: []
families: [family:input-fields]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:icon-resolution-and-component-slots,
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-004/DEC-1, spec:AST-011/DEC-1]
---

# Selector component contract

## Intent

Selector lets a person choose one value from a moderate list while keeping the
trigger usable as a form field or compact toolbar control. It owns single-value
selection, option navigation, search within the supplied options, and the
connection between the closed trigger and its selection surface.

## Compatibility and migration

- Released defaults and behavior are unchanged except the `presentation`
  default, which DEC-1 sets, and `adaptive`'s compact test (below).
- `indicatorPosition` defaults to `end`; a rendered selection mark occupies
  space at that logical edge, while an empty resolved indicator occupies none.
- `presentation` defaults to `adaptive` (DEC-1): the modal bottom sheet on
  compact coarse-pointer screens and the anchored popover otherwise. `popover`
  and `bottom-sheet` pin one surface on every device. The default is a
  stable-default change, so it ships as `[breaking]` in a scheduled minor under
  `spec:AST-017`; callers that need the anchored popover on every device pass
  `popover`.
- `adaptive`'s compact test becomes `spec:AST-012` FR9 (width below the
  effective `md` point or height below 500) in place of the shipped
  `(max-width: 768px)` query: a coarse-pointer screen exactly 768 pixels wide and at least 500 tall opens the popover, and a coarse-pointer screen wider than 768 but under
  500 tall opens the bottom sheet. Both surfaces keep selection working, so no
  caller must change source and the change is not breaking under
  `spec:AST-017` FR1; `popover` and `bottom-sheet` pin one surface. It is
  pending until the shared resolver conforms; FR4 describes the shipped query.
- `hasClear` changes the value contract to include `null`; that distinction is
  already part of the public type.
- `isReadOnly` is additive and defaults to `false`. It preserves the selected
  value, focus, and form participation while removing selection-surface and
  editing affordances. `isDisabled` takes precedence when both are set.
- `secondary` is an additive trigger variant. `input` remains the default;
  existing `input` and `ghost` callers keep their released behavior.
- `spec:AST-004/DEC-1` governs the state-derived indicator-space behavior in FR3.
- 0.7.0 removes the `selector-clear-icon` alias; the shared clear glyph remains
  available through `input-clear-icon`.
- Migration decision: replace the removed theme key and CSS class with
  `input-clear-icon` and `.astryx-input-clear-icon`, or run
  `astryx upgrade --from 0.6.3 --apply --path .`.

### DEP-0011 — Deprecate the `popover` default presentation

| Field            | Value                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | `DEP-0011`                                                                                                                                                          |
| cleanup          | `CLN-0020`                                                                                                                                                          |
| package          | `@astryxdesign/core`                                                                                                                                                |
| surface          | Default `presentation` of `Selector`, `MultiSelector`, and `DropdownMenu` with `items` (and `MoreMenu`, which forwards to it): the anchored popover on every device |
| old contract     | With no `presentation`, the option or action list opens in an anchored, non-modal popover on every device                                                           |
| replacement      | `presentation="popover"` keeps the anchored popover on every device; `adaptive` is released and already accepted                                                    |
| direct authority | `component:Selector` DEC-1. Owners: `cixzhang`, `imdreamrunner`. `MultiSelector` and `DropdownMenu` have no current contract that sets this default                 |
| warning          | Consumer docs and the release notes name `DEP-0011` and `presentation="popover"`. No runtime warning (`spec:AST-017` FR29)                                          |
| migration        | Mechanical where the popover is wanted on every device: add `presentation="popover"`                                                                                |
| codemod          | None by default: pinning `popover` everywhere would opt every caller out of the change. A preserving codemod is mechanical if an owner wants one                    |
| downstream       | Guidance says to keep the default and pin `popover` only when product policy needs it                                                                               |
| transition       | no prior transition                                                                                                                                                 |
| state            | `proposed`                                                                                                                                                          |
| open decision    | Current authority for the `MultiSelector` and `DropdownMenu` defaults                                                                                               |
| target plan      | `CLN-0020` in the next minor release                                                                                                                                |

### CLN-0020 — Selector, MultiSelector, and data-driven DropdownMenu default to `adaptive`

| Field     | Value                                                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id        | `CLN-0020`                                                                                                                                                                                                                                      |
| lifecycle | `DEP-0011`                                                                                                                                                                                                                                      |
| delta     | With no `presentation`, a compact coarse-pointer screen opens a modal bottom sheet (trigger `aria-haspopup="dialog"`, focus moves in and returns on close); every other device keeps the anchored popover. Compound DropdownMenus are unchanged |
| rollback  | Restore the `popover` default from the final-patch baseline                                                                                                                                                                                     |
| state     | `pending` — lands in a declared minor with its `[breaking]` Changeset                                                                                                                                                                           |

## Ownership boundary

**Owns**

- Choosing one value from supplied options.
- Trigger, listbox, option, search, empty, loading, and disabled behavior.
- Keyboard navigation and announcements for that selection flow.
- Selector-specific composition of shared Field, Layer, adaptive presentation,
  and indicator behavior.

**Does not own / non-goals**

- Action or navigation menus; DropdownMenu owns those.
- Multi-value selection; MultiSelector owns it.
- Product-specific option content or filtering performed outside the supplied
  option list.
- Family-wide input state display, behavior, appearance, size, end-control,
  status-placement, and disabled-reason policy — owned by current
  `family:input-fields`.

## Public concepts

This table names semantic concepts reviewers need. Prop syntax, complete defaults,
and examples remain in `Selector.doc.mjs`.

| Concept                | Closed values or states                | Meaning                                                  | Availability by variant/orientation/state | Default    | Owner    | Stability                      | Invalid-value behavior          |
| ---------------------- | -------------------------------------- | -------------------------------------------------------- | ----------------------------------------- | ---------- | -------- | ------------------------------ | ------------------------------- |
| trigger variant        | `input`, `secondary`, `ghost`          | Form-field or button-aligned toolbar presentation        | All trigger states                        | `input`    | Selector | released; `secondary` additive | TypeScript rejects other values |
| size                   | `sm`, `md`, `lg`                       | Trigger and option-row density                           | All presentations                         | `md`       | Selector | released                       | TypeScript rejects other values |
| selected-mark position | `start`, `end`                         | Logical edge containing a rendered selection mark        | Every option row                          | `end`      | Selector | released                       | TypeScript rejects other values |
| presentation           | `popover`, `bottom-sheet`, `adaptive`  | Anchored pointer surface or modal compact-touch surface  | All trigger variants                      | `adaptive` | Selector | released                       | TypeScript rejects other values |
| popup semantics        | `listbox`; modal dialog containing one | Semantics follow the active presentation                 | Popover; bottom sheet                     | `listbox`  | Selector | released                       | No separate role prop is public |
| option-row state       | `selected`, `disabled`                 | Stable theming state on each option row                  | Every rendered option                     | neither    | Selector | released                       | Unknown states are not emitted  |
| read-only state        | `false`, `true`                        | Preserves and submits value without selection affordance | Closed trigger                            | `false`    | Caller   | additive                       | Boolean normalization           |

## Behavioral and layout contract

These requirements describe shipped behavior on current `main`.

| ID  | Shipped invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Evidence                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FR1 | Selecting an enabled option updates the one selected value, closes the active presentation, and returns the trigger to its stable closed state.                                                                                                                                                                                                                                                                                                                                        | Consumer docs and selection interaction tests                             |
| FR2 | Without explicit placement, a non-search popover aligns the selected row over the trigger and clamps it to the viewport. Search popovers and explicit placement use normal Layer positioning.                                                                                                                                                                                                                                                                                          | Consumer docs, implementation, and geometry tests                         |
| FR3 | An option whose resolved selection indicator draws no content reserves no mark-column space. Visible selected or themed replacement indicators remain in layout at `indicatorPosition`; the resulting state-dependent label position or available width is intentional, and row content keeps its existing overflow behavior.                                                                                                                                                          | `itemMarkColumn`, focused indicator tests, and Chromium evidence stories  |
| FR4 | `popover` uses an anchored Popover. `bottom-sheet` uses a modal BottomSheet. `adaptive` resolves to the modal bottom sheet on compact coarse-pointer screens and Popover otherwise.                                                                                                                                                                                                                                                                                                    | Presentation controller and adaptive-presentation tests                   |
| FR5 | While `isLoading` is true, the trigger exposes busy state and the listbox suppresses empty and no-results output.                                                                                                                                                                                                                                                                                                                                                                      | Loading, empty-state, and announcement tests                              |
| FR6 | While `isReadOnly` is true, the selected value remains focusable and form-submittable, while the selection surface, clear action, disclosure indicator, and every value-change path are unavailable.                                                                                                                                                                                                                                                                                   | Read-only interaction, form, and accessibility tests                      |
| FR7 | The listbox carries `data-astryx-menu-press` and follows `module:DropdownMenu/useMenuPress` FR1–FR3, FR5 and AR2: the option under a pointer's release is the one selected, the highlight follows a held pointer through `aria-activedescendant` while DOM focus stays on the combobox, a mouse released outside closes the list and a finger leaves it open, and the browser's stray click never selects. Trigger opening, arrow clamping and closed-trigger typeahead are unchanged. | `module:DropdownMenu/useMenuPress`; `Selector.test.tsx` press model suite |

### Allowed variation

- **AV1 — Indicator rendering.** A theme may replace the check indicator. A
  replacement that draws in both selected and unselected states keeps its mark
  space in both states; only resolved empty output collapses.
- **AV2 — Option content.** `renderOption` may replace visible option content,
  while Selector keeps row role, selection, disabled state, navigation, and
  theming state.
- **AV3 — Selected value content.** `renderValue` may replace the closed value
  display without changing its combobox identity, whether editable or read-only.

### Representative states

| State                    | Required invariant                                                                          | Allowed variation                                          |
| ------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| closed with no value     | Label and placeholder identify the field                                                    | Consumer placeholder text                                  |
| closed with a value      | Selected option is represented in the trigger                                               | Custom `renderValue` content                               |
| pointer / popover        | Anchored surface exposes the listbox without modal-dialog semantics                         | Default or explicit placement                              |
| compact coarse pointer   | BottomSheet exposes a modal dialog containing the listbox                                   | Default or explicit `adaptive`, or explicit `bottom-sheet` |
| searching                | Visible options, keyboard navigation, and announced result count use one filter             | Consumer search and empty text                             |
| loading                  | Trigger is busy; empty and no-results output is suppressed                                  | Consumer loading duration                                  |
| disabled with reason     | Trigger remains focusable (`spec:AST-085`) and exposes the reason; activation stays blocked | Consumer reason text                                       |
| read-only                | Value stays focusable and submittable; menu, clear, and disclosure affordances are absent   | Value rendering, status, and busy presentation             |
| selected/unselected rows | Empty marks consume no width; visible marks retain space at the logical edge                | State-dependent label position/width and themed indicators |

### Transformation and precedence order

- **ORD1 — Option normalization precedes filtering and selection.** Strings and
  option objects become one option shape before search, keyboard matching,
  rendering, and value comparison.
- **ORD2 — Caller-selected content wins deliberately.** `startIcon` takes
  precedence over a selected option's icon; explicit placement takes precedence
  over selected-item overlay alignment.

### Performance and resources

- **PR1 — Search does not add effect-driven result-count renders.** The next
  filtered count is derived from the input change and announced once for that
  query.
- **PR2 — Geometry work is scoped to the open popover.** Selected-item alignment
  may read browser layout while opening; it does not impose document-wide or
  persistent observation while closed.

## Accessibility contract

- **AR1 — Semantics follow presentation.** The anchored presentation exposes a
  listbox through a Popover and the trigger uses `aria-haspopup="listbox"`. The
  touch presentation exposes a modal BottomSheet dialog containing the listbox
  and the trigger uses `aria-haspopup="dialog"`.
- **AR2 — Focus follows the active interaction model.** The anchored presentation
  keeps the combobox relationship at the trigger/search control. The modal touch
  presentation moves focus into its search control or listbox and restores focus
  to the trigger when it closes.
- **AR3 — Keyboard selection matches the visible set.** Arrow, Home/End,
  typeahead, search, Enter, Escape, and Tab behavior operate on the options a
  person can currently perceive.
- **AR4 — Read-only semantics match availability.** A read-only value stays
  focusable, retains `role="combobox"`, and exposes `aria-readonly="true"` plus
  `aria-expanded="false"`. Its rendered content remains the combobox value. It
  does not expose `aria-controls`, `aria-activedescendant`, or an active selection
  surface. The implicit listbox popup describes the widget's selection capability;
  read-only state communicates that its value cannot currently change. Chromium's
  button-hosted combobox mapping omits the ARIA read-only property, so a localized
  accessible description also announces that state. Search and non-search modes
  use the same read-only combobox semantics because neither exposes a search
  control in this state.

## Design relationships

No current design spec is linked.

| Anatomy or state                 | Current representation requirement                                                                                        | Representation authority | Hierarchy role              | Component contract |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------- | ------------------ |
| selected mark and option spacing | Empty resolved marks collapse; visible marks retain space, so row label geometry may vary by state                        | `spec:AST-004/DEC-1`     | supporting                  | FR3                |
| trigger variants                 | `input` reads as a form field; `secondary` matches adjacent secondary `Button`s; `ghost` matches adjacent ghost `Button`s | `component:Selector/DD1` | form or peer action control | Public concepts    |

The first row implements the state-derived spacing decision in
`spec:AST-004/DEC-1`.

### Design decisions

<!-- design-decisions:v1 -->

| ID  | Decision                                                                        | Intent or reason                                                                                                                          | Applies to                                           | Allowed variation                                                                               |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| DD1 | A `secondary` Selector matches the visual role of adjacent secondary `Button`s. | A mixed toolbar or navigation area reads as one action hierarchy instead of making the Selector look like a form field or a ghost action. | The secondary trigger at rest and through its states | Themes may choose exact tokens while preserving parity with their secondary `Button` treatment. |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Field": {"delegatesTo": {"owner": "component:Field", "target": "field"}},
  "Trigger": {"target": "selector"},
  "Icon-rendered start icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Caller-rendered start content": {
    "none": {
      "reason": "intentional: Arbitrary ReactNode content is caller-owned and receives no Selector target."
    }
  },
  "Trigger clear button": {
    "delegatesTo": {
      "owner": "component:Field",
      "target": "input-clear-button"
    }
  },
  "Status icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Indicator icon": {"target": "selector-indicator-icon"},
  "Search row": {"target": "selector-search"},
  "Search icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Search clear button": {
    "delegatesTo": {
      "owner": "component:Field",
      "target": "input-clear-button"
    }
  },
  "Option row": {"target": "selector-option-row"},
  "SelectorOption-rendered content": {"target": "selector-option"},
  "Bare caller-rendered option content": {
    "none": {
      "reason": "intentional: Bare custom renderOption content is caller-owned and does not receive the SelectorOption target."
    }
  },
  "Option selection indicator": {"target": "selector-check"},
  "Option divider": {
    "delegatesTo": {"owner": "component:Divider", "target": "divider"}
  },
  "Section heading": {"target": "selector-section-heading"},
  "Empty state": {"target": "selector-empty-state"},
  "Pointer popup": {"target": "selector-popup"},
  "Touch sheet heading": {
    "delegatesTo": {"owner": "component:Text", "target": "heading"}
  },
  "Touch sheet": {
    "delegatesTo": {
      "owner": "component:BottomSheet",
      "target": "bottom-sheet"
    }
  }
}
```

`Field` is conditional: standalone Selector renders it, while InputGroup owns
that surrounding shell. `Pointer popup` and the two touch-sheet parts are
alternative presentations of the same panel content, not simultaneous anatomy.
Icon-rendered start content delegates to Icon; arbitrary `ReactNode` start content
is caller-owned. The default renderer and custom `renderOption` functions that
return `SelectorOption` retain its target; only bare caller-rendered option
content stays outside that target, while the targeted option row remains.
`input-clear-icon` is the shared canonical target for the clear glyph.

This map records only shipped reachability. It does not treat the accepted,
unimplemented option-source behavior in `spec:AST-001` as current runtime behavior.
`spec:AST-004` governs FR3's shipped indicator-space behavior without adding a
new theming target.

## Family and system relationships

- The current architecture links in frontmatter own public API, theming, icon
  resolution, interaction modality, and Layer behavior used by Selector.
- `spec:AST-004/DEC-1` owns FR3's shipped indicator-space behavior.
- `spec:AST-011/DEC-1` owns the additive read-only state: caller-owned policy can
  preserve a focusable, submittable value without exposing selection controls.
- `family:input-fields` owns family-wide state display, behavior, appearance,
  size, end-control, disabled-reason, and status-placement policy. Selector
  keeps its DEC-1 standalone inline-size exception; this component contract
  owns selection behavior inside that boundary.
- `module:DropdownMenu/useMenuPress` owns the listbox press model FR7 adopts
  (release-to-select, pointer-following highlight, outside-release split,
  stray-click swallowing); Selector keeps arrow clamping and its combobox
  focus (module AR2).

## Verification map

| Contract                           | Verification                                                                                                         | Representative states                                                                                | Mutation or failure expectation                                                                                                                                                                                                                                  | Audit section                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| FR1, AR2, AR3                      | `Selector.test.tsx` selection, focus, and keyboard suites                                                            | closed/open, search/non-search, disabled option                                                      | Removing selection wiring, focus movement, or keyboard behavior fails the named interaction tests                                                                                                                                                                | `audit:Selector/behavior`        |
| FR2                                | placement and selected-item geometry tests                                                                           | default, explicit, RTL, transformed entry                                                            | Using the wrong positioning model fails the expected position-area or margin                                                                                                                                                                                     | `audit:Selector/behavior`        |
| FR3, AV1                           | Focused `Selector.test.tsx` computed-display checks plus guarded Chromium Storybook matrix and stable visual stories | popover/bottom sheet, narrow/wide, start/end, LTR/RTL, selected/unselected, check/radio              | Empty output reserves width, visible output collapses, logical placement flips incorrectly, or row content overflows                                                                                                                                             | `audit:Selector/design-rendered` |
| FR4, AR1, AR2                      | presentation tests plus `aria-haspopup` source review                                                                | pointer, compact coarse pointer, search/non-search                                                   | Wrong Popover/dialog roles or focus destinations fail tests; `aria-haspopup` values require source/a11y review                                                                                                                                                   | `audit:Selector/accessibility`   |
| AR1, AV2                           | `Selector.listbox.a11y.test.tsx` and `Listbox.a11y.chromium.spec.ts` against the shared Listbox contract             | popover/sheet, flat/grouped, selected/unselected, disabled, search, loading, custom RTL              | A new or wider loss of role, listbox/option name, state, or ownership gates; the exact unnamed no-search sheet state remains known debt                                                                                                                          | `audit:Selector/accessibility`   |
| FR5, FR6, AR1, AR2 (anchored), AR4 | `Selector.combobox.a11y.test.tsx` and `Selector.combobox.a11y.chromium.spec.ts` against the shared Combobox contract | closed, open with active option, read-only, busy, bottom-sheet open, search input with active option | The trigger or search input loses its role/name/state or popup kind, its open popup or active option relationship breaks, or read-only exposes a selection surface; the bottom-sheet trigger's `aria-controls` naming the inner listbox remains exact known debt | `audit:Selector/accessibility`   |
| FR5                                | loading, empty-state, and live-region tests                                                                          | empty options, unmatched search, loading                                                             | Empty/no-results output appears or is announced while loading                                                                                                                                                                                                    | `audit:Selector/behavior`        |
| FR6, AR4                           | read-only interaction, form, ARIA, and theme-state tests                                                             | search/non-search, clearable, open→read-only, disabled precedence                                    | A value changes, popup or edit affordance remains, form value disappears, or read-only semantics are absent                                                                                                                                                      | `audit:Selector/accessibility`   |
| FR7                                | `Selector.test.tsx` press model suite                                                                                | finger release over another option, finger/mouse release outside, listbox marker                     | The press option is selected, the listbox takes focus, a finger release outside closes the list, or the stray click selects                                                                                                                                      | `audit:Selector/behavior`        |
| source-build contract              | `Selector.source-build.test.mjs`                                                                                     | package source compiled by consumer Babel                                                            | Moving evaluated StyleX values outside the supported source form fails compilation                                                                                                                                                                               | `audit:Selector/code-health`     |

## Decision log

FR3 implements the system decision owned by `spec:AST-004/DEC-1`.

### DEC-1 — Default presentation is `adaptive`

**Reference:** `component:Selector/DEC-1`
**Decider:** `cixzhang`, `2026-10-06`

An omitted `presentation` resolves `adaptive` (FR4): the modal bottom sheet on
compact coarse-pointer screens and the anchored popover elsewhere, so
fine-pointer and large-screen output matches `popover`. `adaptive` keeps its
width-and-pointer query; a pointer-only test belongs to `spec:AST-043` OQ1.
Rejected: keeping `popover` as the default, because a phone then gets a
pointer-sized anchored list unless the caller opts in.

## Open questions

None.

## Content boundary

This file does not copy the full prop reference, examples, current audit score,
family proposals, or future implementation steps. Those remain with their
existing owners.
