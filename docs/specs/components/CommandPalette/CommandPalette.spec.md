---
schema_version: 3
template_version: 7
kind: component
id: component:CommandPalette
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
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

| Area                    | Contract                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `CommandPalette` with its documented props and slots, composed from `CommandPaletteInput`, `CommandPaletteList`, `CommandPaletteItem`, `CommandPaletteGroup`, `CommandPaletteEmpty`, and `CommandPaletteFooter`, inside a Dialog.                                                           |
| Behavior                | Searchable commands in a Dialog: a combobox query field, a listbox of results only while selectable results exist, an empty message otherwise, and a keyboard-guidance footer. Modal Escape belongs to Dialog's shared dismissal.                                                           |
| End-user impact         | Keyboard and screen-reader users search and run commands with native text editing kept intact, hear the empty message that is shown, and close nested layers one Escape at a time.                                                                                                          |
| Builder impact          | None.                                                                                                                                                                                                                                                                                       |
| Compatibility/readiness | Records shipped behavior; no public change. AR1's caller `aria-label` rule is an implementation gap in `component:CommandPaletteList`, listed in its Current-state impact; two owner questions stay open (OQ2 asks whether INV5 should state this composite-semantics reading family-wide). |
| Review checks           | Reject local modal Escape handling, IME routing, Home/End result navigation, empty listboxes, stale active descendants, placeholder-only names, mismatched Empty announcements, or gaps.                                                                                                    |
| Governing rules         | `family:overlay-dismissal/FR1`, `FR2`, `FR4`, `FR5`; `spec:AST-056/FR3`, `AR1`, `AR2`; existing public component and delegated-owner contracts.                                                                                                                                             |

This table is a review projection; the body below is authoritative.

## Intent

CommandPalette presents searchable commands inside a Dialog. It owns search and
selection orchestration plus the aggregate consumer anatomy while delegating its
surface and modal dismissal ordering to Dialog.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: as documented in `CommandPalette.doc.mjs`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **The List replaces a caller's name (AR1).** A builder's explicit
  `aria-label` does not name the List today; `component:CommandPaletteList`
  records the gap.

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
- A `command-palette` root target — no such target exists.
- Shared layer hosting, positioning, or lifecycle rules beyond the current
  records linked below.
- The List root's accessible name, list-id application, native passthrough, and
  overflow scrolling — owned by `component:CommandPaletteList`.
- The Group's role, name, and heading — owned by `component:CommandPaletteGroup`;
  the Footer's guidance — owned by `component:CommandPaletteFooter`; the Empty
  surface — owned by `component:CommandPaletteEmpty`.

## Public concepts

No new public concept is introduced. Consumer props, slots, and usage remain
documented in `CommandPalette.doc.mjs` and its subcomponent docs.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                        | Basis                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| FR1 | The default render places Input and Footer around a result surface inside a delegated Dialog. That surface is a List listbox while Items exist and an ordinary Empty container otherwise.        | Current source, docs, tests, and ARIA required-child rule      |
| FR2 | Input, List, Item, Group, Group heading, Empty, and Footer carry the seven current `command-palette-*` targets documented below; no `command-palette` root target exists.                        | Current source and target docs                                 |
| FR3 | The default Input delegates its Search glyph to Icon and pending Loading spinner to Spinner; the default Footer delegates keyboard shortcuts to Kbd; the containing surface delegates to Dialog. | Current source and component docs                              |
| FR4 | Query field is a distinct native text field inside Input and has no separate public target. The `command-palette-input` target is on the surrounding search region, not the native field.        | Current source and target docs                                 |
| FR5 | A modal palette leaves Escape unclaimed for Dialog's shared dismissal stack so a nested member handles the first press; inline previews close locally because they do not register as layers.    | `family:overlay-dismissal/FR1`, `FR2`, `FR4`, `FR5`            |
| FR6 | The editable query field keeps Home and End for native caret movement, uses PageUp and PageDown for first/last result navigation, and does not route active IME composition keys to commands.    | WAI-ARIA editable combobox convention; objective IME integrity |
| FR7 | A committed result set resets highlight before exposure; the query input emits active-descendant only for an index that exists in the current selectable set.                                    | WAI-ARIA active-descendant integrity                           |
| FR8 | Empty search announcements mirror rendered `emptySearchText`, including rich caller content; the query input's default accessible name is independent of its placeholder.                        | `spec:AST-056/FR3`, `AR1`, `AR2`                               |

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

- No search, selection, layout, or styling precedence rule beyond FR1–FR8.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Named composite.** The containing Dialog, combobox, populated listbox,
  groups, options, busy status, empty state, and keyboard guidance preserve their
  owned accessible names and roles. A caller's explicit `aria-label` names a List or
  Group (`architecture:public-component-api` INV5); the `listbox` and `option`
  roles and option state stay component-owned, as
  `component:CommandPaletteInput` AR3 records. `component:CommandPaletteList`
  records where today's List replaces a caller's name. When no selectable results exist, the result
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
`command-palette-input`. It has no direct target; whether it should is OQ1.

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
their existing component owners. The Query field `none` disposition is
unsettled (OQ1) and does not authorize a new target.

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, target
  mapping, delegation, and factual `none` dispositions.
- `architecture:public-component-api` owns the stable props and composition
  surface.
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

| Contract            | Verification                                                               | Representative states                                            | Mutation or failure expectation                                                                                                                         | Audit section                      |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| FR1, AR1            | CommandPalette root and subcomponent suites                                | Default, grouped, empty, pending, rich Empty, and replaced slots | Exposing an empty listbox, leaving empty Input popup attributes, or nesting rich Empty controls under option semantics fails focused role assertions.   | `audit:CommandPalette/anatomy`     |
| FR2                 | Focused subcomponent suites and `themingTargets.test.ts`                   | Seven local targets at their owned elements                      | Removing or moving a current target fails a focused placement assertion or the global inventory.                                                        | `audit:CommandPalette/theming`     |
| FR3                 | `CommandPaletteInput.test.tsx` and `CommandPaletteFooter.test.tsx`         | Default Search glyph, pending spinner, and Footer Kbd            | Replacing or removing the delegated Icon, Spinner, or Kbd instance fails a composed-owner assertion.                                                    | `audit:CommandPalette/theming`     |
| FR4                 | `CommandPaletteInput.test.tsx`                                             | Native query field with idle and pending Input                   | Removing the field fails combobox tests; adding a field target requires an explicit map update.                                                         | `audit:CommandPalette/anatomy`     |
| FR5, AR2, AR3       | `CommandPalette.test.tsx`                                                  | Modal host with nested layer; inline preview                     | Restoring local modal Escape handling closes the host instead of the nested surface; removing the inline branch loses preview closing.                  | `audit:CommandPalette/interaction` |
| FR6, AR4            | `CommandPalette.test.tsx` and `CommandPaletteInput.test.tsx`               | Home, End, PageDown, Enter, and active IME composition           | Routing Home/End to results or forwarding a composing command key fails user-event and native composition assertions.                                   | `audit:CommandPalette/interaction` |
| FR7, AR7            | `CommandPalette.test.tsx` and `CommandPaletteInput.test.tsx`               | Populated, empty, and repopulated result sets                    | Preserving an out-of-range highlight or emitting its nonexistent active descendant fails transition and direct bounds assertions.                       | `audit:CommandPalette/a11y`        |
| FR8, AR5, AR6       | `CommandPalette.test.tsx`, `CommandPaletteInput.test.tsx`, and i18n checks | Rich caller Empty content; default and caller query names        | Announcing catalog copy over rendered caller content or naming the query only through placeholder text fails live-region, name, and catalog assertions. | `audit:CommandPalette/a11y`        |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                              | Canonical anatomy and seven current local targets                | Missing, extra, prefixed, stale, or alias-backed mappings fail repository validation. Gap: no check fails if a mapped part stops painting.              | `audit:CommandPalette/theming`     |

Focused target-placement assertions cover all seven local targets. The composed
Input and Footer tests also pin the delegated Search Icon, pending Spinner, and
four default Kbd shortcuts.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Should Query field gain a stable public theming target?** (`human-api`)
  It has no direct target today, and no owner has decided whether it should.
- **OQ2 — Should `architecture:public-component-api` INV5 state the
  composite-semantics reading family-wide?** (`human-api`) Inside a composite
  such as CommandPalette, roles like `combobox`, `listbox`, and `option` and
  option state are component-owned and replace a caller's, as
  `component:CommandPaletteInput` AR3 records, while a caller's explicit name
  still wins. Stating it in INV5 would make every composite follow it; leaving
  it here keeps it a CommandPalette reading that other composites may not
  share.

## Content boundary

This file does not duplicate consumer prop tables/examples, shared layer or
modality rules, or implementation steps. It links to
their owners.
