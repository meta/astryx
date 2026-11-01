---
schema_version: 3
template_version: 7
kind: component
id: component:CommandPalette
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/CommandPalette/CommandPalette.test.tsx,
    packages/core/src/CommandPalette/CommandPaletteInput.test.tsx,
    packages/core/src/CommandPalette/CommandPaletteList.test.tsx,
    packages/core/src/CommandPalette/CommandPaletteItem.test.tsx,
    packages/core/src/CommandPalette/CommandPaletteGroup.test.tsx,
    packages/core/src/CommandPalette/CommandPaletteFooter.test.tsx,
    packages/core/src/CommandPalette/__tests__/CommandPalette.a11y.chromium.spec.ts,
    packages/core/src/CommandPalette/__tests__/CommandPaletteFooter.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-056]
---

# CommandPalette component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Prop and visual APIs are unchanged. The result surface exposes listbox semantics only with selectable results; the query input has a real default name; rich Empty content remains ordinary. |
| Behavior                | Modal Escape delegates to Dialog; query-field Home/End and IME remain native; result changes reset stale highlight; Empty announcements mirror rendered content.                             |
| End-user impact         | Nested dismissal and native text entry are preserved; assistive technology receives the visible empty message, an independent query-field name, and only existing active options.            |
| Builder impact          | None; no migration or new caller choice.                                                                                                                                                     |
| Compatibility/readiness | Visual output is preserved. Empty-result ARIA, query-field accessible naming, empty-state announcement, and highlight reset behavior are corrected and verified.                             |
| Review checks           | Reject local modal Escape handling, IME routing, Home/End result navigation, empty listboxes, stale active descendants, placeholder-only names, mismatched Empty announcements, or gaps.     |
| Governing rules         | `family:overlay-dismissal/FR1`, `FR2`, `FR4`, `FR5`; `spec:AST-056/FR3`, `AR1`, `AR2`; existing public component and delegated-owner contracts.                                              |

This table is a review projection; the body below is authoritative.

## Intent

CommandPalette presents searchable commands inside a Dialog. It owns search and
selection orchestration plus the aggregate consumer anatomy while delegating its
surface and modal dismissal ordering to Dialog.

## Compatibility and migration

- Released default preserved: `yes` for props and visual output
- Compatibility class: behavioral and accessibility correction; empty states
  conditionally omit listbox, expanded, controls, and active-descendant ARIA
  attributes until selectable results exist; the default query accessible name
  is independent of its placeholder; empty-search announcements mirror the
  rendered content; public props, styling, targets, and visible defaults remain
  unchanged
- Controlled/uncontrolled behavior: unchanged
- Migration decision: adopts `family:overlay-dismissal/FR1`, `FR2`, `FR4`, and
  `FR5` through Dialog; no caller migration

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Search orchestration and composition of the current Input, List, Item, Group,
  Group heading, Empty, and Footer parts and targets.
- Composition of the native Query field rendered inside the default Input; the field's semantics and native passthrough are owned by `component:CommandPaletteInput`.

**Does not own / non-goals**

- Dialog's surface, Icon's glyph, Spinner's loading indicator, or Kbd's shortcut
  badges — owned by their respective components.
- Caller-provided replacement Input, Footer, item content, or trailing input
  content — owned by the product callsite.
- The Item option's passthrough, pointer, disabled, selected, highlighted, and
  standalone-scroll semantics — owned by `component:CommandPaletteItem`.
- A `command-palette` root target — no such current target exists, and this
  factual backfill does not invent one.
- Shared layer hosting, positioning, or lifecycle rules beyond the current
  records linked below.
- The List root's accessible name, list-id application, native passthrough, and
  overflow scrolling — owned by `component:CommandPaletteList`.

## Public concepts

No new public concept is introduced. Consumer props, slots, and usage remain
documented in `CommandPalette.doc.mjs` and its subcomponent docs.

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                 | Basis                                                          | Draft review state                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FR1 | The current default render places Input and Footer around a result surface inside a delegated Dialog. That surface is a List listbox while Items exist and an ordinary Empty container otherwise.   | Current source, docs, tests, and ARIA required-child rule      | Verified current anatomy and valid rich Empty semantics                   |
| FR2 | Input, List, Item, Group, Group heading, Empty, and Footer carry the seven current `command-palette-*` targets documented below; no `command-palette` root target exists.                           | Current source and target docs                                 | Verified current inventory and focused placement coverage                 |
| FR3 | The default Input delegates its Search glyph to Icon and pending Loading spinner to Spinner; the default Footer delegates keyboard shortcuts to Kbd; the containing surface delegates to Dialog.    | Current source and component docs                              | Verified current composition; no ownership change                         |
| FR4 | Query field is a distinct native text field inside Input and currently has no separate public target. The `command-palette-input` target is on the surrounding search region, not the native field. | Current source and target docs                                 | Verified current reachability; long-term theming intent remains unsettled |
| FR5 | A modal palette leaves Escape unclaimed for Dialog's shared dismissal stack so a nested member handles the first press; inline previews close locally because they do not register as layers.       | `family:overlay-dismissal/FR1`, `FR2`, `FR4`, `FR5`            | Verified by nested and inline integration tests                           |
| FR6 | The editable query field keeps Home and End for native caret movement, uses PageUp and PageDown for first/last result navigation, and does not route active IME composition keys to commands.       | WAI-ARIA editable combobox convention; objective IME integrity | Verified by user-event navigation and composition-key tests               |
| FR7 | A committed result set resets highlight before exposure; the query input emits active-descendant only for an index that exists in the current selectable set.                                       | WAI-ARIA active-descendant integrity                           | Verified across populated, empty, and repopulated results                 |
| FR8 | Empty search announcements mirror rendered `emptySearchText`, including rich caller content; the query input's default accessible name is independent of its placeholder.                           | `spec:AST-056/FR3`, `AR1`, `AR2`                               | Verified by live-region and accessible-name tests                         |

### Allowed variation

- **AV1 — Results.** Item count, grouping, selected content, and empty state may
  vary without changing the aggregate anatomy.
- **AV2 — Slots.** Caller-provided Input and Footer content may replace the
  defaults without becoming CommandPalette-owned subparts.
- **AV3 — Delegated rendering.** Dialog, Icon, Spinner, and Kbd may change their
  internal element shape while preserving their own public contracts.

### Representative states

| State                  | Required invariant                                                            | Allowed variation                                          |
| ---------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Ungrouped results      | List contains Item instances.                                                 | Item count and caller-rendered content.                    |
| Grouped results        | List contains Group, Group heading, and Item instances.                       | Group names, count, ordering, and item content.            |
| Empty bootstrap/search | Empty replaces listbox semantics; search-empty text is announced as rendered. | Caller-provided rich content, including ordinary controls. |
| Pending search         | Default Input may contain Loading spinner.                                    | Spinner is absent when no search is pending.               |
| Default slots          | Input and Footer render their documented defaults.                            | Footer shortcut text and translated labels.                |
| Caller-replaced slots  | The slot content replaces the corresponding default.                          | Replacement structure remains caller-owned.                |

### Transformation and precedence order

- No new search, selection, layout, or styling precedence rule is introduced.

### Performance and resources

- No new performance or resource rule is introduced.

## Accessibility contract

- **AR1 — Named composite.** The containing Dialog, combobox, populated listbox,
  groups, options, busy status, empty state, and keyboard guidance preserve their
  owned accessible names and roles. When no selectable results exist, the result
  surface and combobox omit listbox, expanded, controls, and active-descendant
  semantics so rich Empty content stays ordinary non-nested content.
- **AR2 — Topmost Escape.** A modal palette delegates unclaimed Escape presses to
  Dialog's shared dismissal stack. A nested registered surface handles the first
  press; the host palette remains open until it becomes topmost.
- **AR3 — Inline preview.** Documentation-only inline rendering remains outside
  the shared layer stack and preserves its local Escape close behavior.
- **AR4 — Editable query keys.** Home and End preserve native caret movement;
  PageUp and PageDown navigate to the first and last results; active IME
  composition keys remain owned by the input method.
- **AR5 — Rendered empty message.** A search dead end announces the text rendered
  by `emptySearchText`, including text produced by caller components and links.
- **AR6 — Query-field name.** The default query field name is a localized
  "Search commands" label independent of its placeholder; caller `label` and
  native `aria-label` overrides remain supported.
- **AR7 — Existing active option.** Result changes reset highlight, and
  `aria-activedescendant` is present only when the indexed option exists in the
  current selectable set.

## Design relationships

| Anatomy or state  | Design requirement                                                      | Representation authority       | Hierarchy role | Component contract |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Dialog            | Presents the containing modal surface.                                  | `component:Dialog`             | Supporting     | FR1, FR3           |
| Input             | Paints the search region around the query field and supporting visuals. | Current source and public docs | Prominent      | FR1, FR2, FR4      |
| Search glyph      | Presents the search symbol in the default Input.                        | `component:Icon`               | Supporting     | FR3                |
| Query field       | Accepts the native text query inside Input.                             | Current source and public docs | Prominent      | FR1, FR4           |
| Loading spinner   | Indicates a pending search in the default Input.                        | `component:Spinner`            | Supporting     | FR3                |
| List              | Presents the current result collection or Empty state.                  | Current source and public docs | Supporting     | FR1, FR2           |
| Item              | Presents one selectable command result.                                 | Current source and public docs | Prominent      | FR1, FR2           |
| Group             | Arranges related Items together.                                        | Current source and public docs | Supporting     | FR1, FR2           |
| Group heading     | Labels one Group visually.                                              | Current source and public docs | Supporting     | FR1, FR2           |
| Empty             | Presents the no-results or no-query message.                            | Current source and public docs | Prominent      | FR1, FR2           |
| Footer            | Presents default guidance or caller-provided footer content.            | Current source and public docs | Supporting     | FR1, FR2           |
| Keyboard shortcut | Presents one shortcut as painted key badges in the default Footer.      | `component:Kbd`                | Supporting     | FR3                |

The native Query field is separate from the Input region that carries
`command-palette-input`. Its current lack of a direct target is observed
reachability, not a decision that it must remain unthemeable.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Dialog": {
    "delegatesTo": {"owner": "component:Dialog", "target": "dialog"}
  },
  "Input": {"target": "command-palette-input"},
  "Search glyph": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Query field": {
    "none": {
      "reason": "unsettled: No current public target is applied directly to the native query field; future exposure still needs an owner decision"
    }
  },
  "Loading spinner": {
    "delegatesTo": {"owner": "component:Spinner", "target": "spinner"}
  },
  "List": {"target": "command-palette-list"},
  "Item": {"target": "command-palette-item"},
  "Group": {"target": "command-palette-group"},
  "Group heading": {"target": "command-palette-group-heading"},
  "Empty": {"target": "command-palette-empty"},
  "Footer": {"target": "command-palette-footer"},
  "Keyboard shortcut": {
    "delegatesTo": {"owner": "component:Kbd", "target": "kbd"}
  }
}
```

The seven local targets are current public seams. The delegated parts retain
their existing component owners. The Query field `none` disposition records a
current audit gap and does not authorize a new target.

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, target
  mapping, delegation, and factual `none` dispositions.
- `architecture:public-component-api` owns the stable props and composition
  surface; this documentation adds no API.
- `architecture:interaction-modality/INV4` owns supported-modality path
  reachability; the exact query-key details follow objective editable-combobox
  and IME composition standards.
- `spec:AST-056/FR3`, `AR1`, and `AR2` own rendered empty-search announcement
  parity and an accessible query-field name independent of placeholder text.
- `family:overlay-dismissal` owns topmost Escape and close-request ordering;
  CommandPalette adopts it through Dialog while preserving local inline-preview
  closing because inline mode does not register as a layer.
- `architecture:layer-runtime` records that the modal path delegates Escape to
  Dialog's shared dismissal registration while the unregistered inline preview
  preserves local closing.

## Verification map

| Contract            | Verification                                                                          | Representative states                                            | Mutation or failure expectation                                                                                                                                      | Audit section                      |
| ------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| FR1, AR1            | CommandPalette root and subcomponent suites plus exact-head Chromium evidence         | Default, grouped, empty, pending, rich Empty, and replaced slots | Exposing an empty listbox, leaving empty Input popup attributes, or nesting rich Empty controls under option semantics fails focused role and hosted axe assertions. | `audit:CommandPalette/anatomy`     |
| FR2                 | Focused subcomponent suites and `themingTargets.test.ts`                              | Seven local targets at their owned elements                      | Removing or moving a current target fails a focused placement assertion or the global inventory.                                                                     | `audit:CommandPalette/theming`     |
| FR3                 | `CommandPaletteInput.test.tsx`, `CommandPaletteFooter.test.tsx`, and browser evidence | Default Search glyph, pending spinner, and Footer Kbd            | Replacing or removing the delegated Icon, Spinner, or Kbd instance fails a composed-owner assertion and changes the exact-head evidence inventory.                   | `audit:CommandPalette/theming`     |
| FR4                 | `CommandPaletteInput.test.tsx` and source inspection                                  | Native query field with idle and pending Input                   | Removing the field fails combobox tests; adding a field target requires an explicit map update.                                                                      | `audit:CommandPalette/anatomy`     |
| FR5, AR2, AR3       | `CommandPalette.test.tsx`                                                             | Modal host with nested layer; inline preview                     | Restoring local modal Escape handling closes the host instead of the nested surface; removing the inline branch loses preview closing.                               | `audit:CommandPalette/interaction` |
| FR6, AR4            | `CommandPalette.test.tsx` and `CommandPaletteInput.test.tsx`                          | Home, End, PageDown, Enter, and active IME composition           | Routing Home/End to results or forwarding a composing command key fails user-event and native composition assertions.                                                | `audit:CommandPalette/interaction` |
| FR7, AR7            | `CommandPalette.test.tsx` and `CommandPaletteInput.test.tsx`                          | Populated, empty, and repopulated result sets                    | Preserving an out-of-range highlight or emitting its nonexistent active descendant fails transition and direct bounds assertions.                                    | `audit:CommandPalette/a11y`        |
| FR8, AR5, AR6       | `CommandPalette.test.tsx`, `CommandPaletteInput.test.tsx`, and i18n checks            | Rich caller Empty content; default and caller query names        | Announcing catalog copy over rendered caller content or naming the query only through placeholder text fails live-region, name, and catalog assertions.              | `audit:CommandPalette/a11y`        |
| Theming anatomy map | `scripts/check-knowledge.mjs` and exact-head Chromium evidence                        | Canonical anatomy and seven current local targets                | Missing, extra, prefixed, stale, alias-backed, or visually absent mappings fail repository validation or browser sensor counts.                                      | `audit:CommandPalette/theming`     |

Focused target-placement assertions cover all seven local targets. The composed
Input and Footer tests also pin the delegated Search Icon, pending Spinner, and
four default Kbd shortcuts; exact-head browser evidence verifies the same owned
anatomy across light, dark, LTR, RTL, and narrow rendering.

## Decision log

None. This draft records current facts and introduces no component-local design,
layer, API, or theming decision.

## Open questions

- **OQ1 — Should Query field gain a stable public theming target?** (`human-api`)
  Its current lack of direct reachability is an audit gap, not settled intent.

## Content boundary

This file does not duplicate consumer prop tables/examples, shared layer or
modality rules, current audit results, or implementation steps. It links to
their owners.
