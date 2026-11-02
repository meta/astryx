---
schema_version: 3
template_version: 7
kind: component
id: component:BaseTypeahead
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Typeahead/BaseTypeahead.test.tsx,
    packages/core/src/Typeahead/BaseTypeahead.incremental.test.tsx,
    packages/core/src/Typeahead/Typeahead.test.tsx,
    packages/core/src/Typeahead/BaseTypeahead.emptyState.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:layer-runtime,
  ]
contributing: []
system_specs:
  [spec:AST-020/FR15, spec:AST-058, spec:AST-085, spec:AST-086, spec:AST-092]
---

# BaseTypeahead component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. BaseTypeahead takes a search source, controlled `value` and `onChange`, `hasEntriesOnFocus`, `minQueryLength`, debounce, result cap, `renderItem`, `size`, popup width, disabled props, and BaseProps for the input.                          |
| Behavior                | A bare combobox input searches after a grapheme threshold and debounce, rejects stale responses, and shows a named listbox of options with keyboard and pointer selection; a completed empty search shows a message (today a disabled option, the FR4 gap). |
| End-user impact         | People find and pick a result by typing; screen-reader users hear result counts. An Escape-dismissed list can reopen when a late response lands, and a natively disabled input loses its Tab stop.                                                          |
| Builder impact          | Direct callers own the visible wrapper, label, and focus ring; Typeahead and Tokenizer compose it.                                                                                                                                                          |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. The empty-search option, the Escape reopen, caller handlers while disabled, native `disabled`, and the result content order are listed under Current-state impact.                                |
| Review checks           | Reject stale results replacing newer ones, an invalid listbox, a busy state without one Spinner, dropped BaseProps, or a popup past the viewport gutters.                                                                                                   |
| Governing rules         | `spec:AST-020` FR15; `spec:AST-085` FR1, FR2; `spec:AST-058` FR7, FR9; `spec:AST-086`; `spec:AST-092`; `family:overlay-dismissal`; `architecture:public-component-api`; `architecture:layer-runtime`.                                                       |

This table is a review projection; the body below is authoritative.

## Intent

BaseTypeahead is the exported combobox engine beneath Typeahead and Tokenizer. It
renders a bare input, search and bootstrap behavior, keyboard navigation, a
styled result listbox, loading feedback, and selection callbacks. A direct caller
supplies the visible input wrapper, accessible name, and selected-value
presentation.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: `value` is controlled; query text is
  internal
- Migration decision: none; public-surface cleanup is OQ1 and OQ2

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Query text, search/bootstrap scheduling, stale-response rejection, result
  ordering, highlight, and selection callbacks.
- Combobox, listbox, option, busy, selected, and empty-result semantics.
- The anchored result popup and current dropdown/empty-state visual treatment.
- Direct-caller loading feedback when a composed wrapper does not take over the
  busy indicator lane.

**Does not own / non-goals**

- The visible input wrapper, label presentation, field border, or focus ring.
- Selected-value or token presentation in Typeahead and Tokenizer.
- Caller-rendered result content.
- Spinner presentation, owned by `component:Spinner`.
- Shared top-layer hosting, positioning, and dismissal behavior, owned by
  `architecture:layer-runtime` and `family:overlay-dismissal`.

## Public concepts

| Concept         | Closed values or states                  | Meaning                                                      | Availability by state      | Default                          | Owner                        | Stability | Invalid-value behavior                                                                        |
| --------------- | ---------------------------------------- | ------------------------------------------------------------ | -------------------------- | -------------------------------- | ---------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| selection       | `T` or `null`                            | Caller-controlled selected result                            | all states                 | required                         | `component:BaseTypeahead`    | stable    | caller retains control                                                                        |
| search source   | `search`, `bootstrap`, optional `cancel` | Supplies query and focus results                             | enabled input              | required                         | `component:BaseTypeahead`    | stable    | rejected work clears current results                                                          |
| focus bootstrap | on or off                                | Offers bootstrap results before query input                  | empty focused input        | off                              | `component:BaseTypeahead`    | stable    | off keeps the menu closed                                                                     |
| query threshold | non-negative number                      | Minimum visible-character count before search                | non-empty query            | `1`                              | `component:BaseTypeahead`    | stable    | below threshold cancels work and closes results                                               |
| debounce        | milliseconds                             | Delays query search                                          | typed query                | `150`                            | `component:BaseTypeahead`    | stable    | non-positive runs immediately                                                                 |
| result cap      | number                                   | Limits fetched results shown                                 | completed search/bootstrap | `10`                             | `component:BaseTypeahead`    | stable    | source order is preserved                                                                     |
| result content  | default, `renderItem`, or `item.element` | Chooses content inside the stable option row                 | result present             | default TypeaheadItem            | caller and component         | stable    | `item.element` takes precedence, except that a caller `renderItem` replaces it (the ORD1 gap) |
| disabled state  | native or focusable-disabled             | Blocks query mutation; native disabled blocks all activation | disabled                   | native disabled                  | component and caller wrapper | stable    | a list open before focusable-disabled applied picks nothing and can still close               |
| popup width     | intrinsic or fixed pixels                | Sets result popup width before viewport clamping             | popup present              | intrinsic, at least anchor width | `component:BaseTypeahead`    | stable    | viewport fit wins                                                                             |
| size            | `sm`, `md`, `lg`                         | Selects option-row padding                                   | popup options              | `md`                             | `component:BaseTypeahead`    | stable    | TypeScript rejects other values                                                               |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| FR1  | The input is controlled by internal query state while `value` is caller-controlled; selecting a result calls `onChange(item)`, clears query/results, closes the popup, and returns focus to the input.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current source and tests                                           |
| FR2  | Search starts only at the grapheme-count threshold, uses the configured debounce, and never presents an empty result for a query that was not searched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests                                           |
| FR3  | A newer query, selection, clear, source replacement, or unmount invalidates stale asynchronous work. Escape hides the current popup without invalidating pending work, so a late response reopens it. Lists for a query that is no longer current, including partial lists, are dropped (`spec:AST-092` FR4). ArrowDown on a closed field after the source was replaced searches the replacement instead of showing the old list.                                                                                                                                                                                                                                                                                                                                                                                                | Current source and tests; `spec:AST-092` FR4                       |
| FR4  | The popup is a named listbox whose result rows are options, and no active descendant is set while no option shows. A completed empty search's message MUST be presentational and announced as `spec:AST-056` AR1 requires (`spec:AST-058` FR7). Implementation gap: the message renders as one disabled option.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | APG combobox pattern; `spec:AST-058` FR7; current source and tests |
| FR5  | Arrow keys wrap the highlight; Home/End move to the first/last option; Enter selects; Escape and Tab hide the current popup, Tab moving focus on; IME-owned key events do not activate combobox commands. Escape dismissal is not durable while source work remains pending (FR3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `spec:AST-020` FR15; current source and tests                      |
| FR6  | Pending asynchronous source work sets `aria-busy` and renders one Spinner unless the composed wrapper owns the busy indicator lane; each busy transition is reported once.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `family:input-fields`; `spec:AST-086`; current tests               |
| FR7  | Supported BaseProps DOM, ARIA, data, class, style, event, and `xstyle` inputs reach the combobox input while component-owned role, state, value, and behavior stay authoritative; an omitted legacy alias keeps its native equivalent and a defined one overrides it. A direct caller's `onKeyDown` runs before the built-in key handling, and `preventDefault()` in it skips that handling (`architecture:public-component-api` INV7); Typeahead and Tokenizer use it for their own Escape and Backspace handling, and run their callers' `onKeyDown` after the built-in handling (`component:Typeahead` FR9).                                                                                                                                                                                                                  | `architecture:public-component-api` INV5–INV7; current tests       |
| FR8  | The popup stays within the inline viewport at 320 CSS px, including long default results and a requested width larger than the available viewport.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source                                                     |
| FR9  | A disabled input MUST stay focusable with `aria-disabled` (`spec:AST-085` FR1), and caller handlers other than focus and blur MUST NOT run while disabled (FR2). Focusable-disabled uses `aria-disabled` plus `readOnly` and blocks text and query mutation, opening the list, and selection by Enter or a press, including from a list that was open before it applied; that list can still close, and search work in flight when it applies is dropped. Typeahead always uses focusable-disabled, and Tokenizer does except in `unfocusedLayer` mode without a `disabledMessage`, where the input is still natively `disabled`. Implementation gap: the default disabled mode is native `disabled`, which removes the Tab stop, and a focusable-disabled input still runs caller `onClick`, `onPointerDown`, and key handlers. | `spec:AST-085` FR1, FR2; current source and tests                  |
| FR10 | A search source may show partial lists for a query through `context.update` before `search()` settles; the typeahead follows `spec:AST-092` FR1–FR10: it shows a partial list at once and stays busy until the final list, keeps shown rows and the highlight in place as later lists append, keeps an option's id while its item stays, announces once per query when it settles, keeps the last non-empty list when the answer fails, and warns in development when a later list moves shown rows.                                                                                                                                                                                                                                                                                                                             | `spec:AST-092`                                                     |
| FR11 | The typeahead panel has not adopted the option-action grid: a result's `action` is not rendered, the row shows without it, and a development warning reports it once (`spec:AST-058` FR9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `spec:AST-058` FR9; current source                                 |
| FR12 | While the list is open, a press that starts and ends on the field's input or its buttons, or in the list, keeps the list open; a press that starts and ends anywhere else closes it, and a scroll or pinch that starts outside does not. A press on the field's label or a Tokenizer token moves focus out of the input and back, so the list closes and reopens on that press and ends open. A field inside an open shadow root counts the same. The list is a manual popover, because the browser's light dismiss counts a press in a text input as outside (`architecture:layer-runtime`).                                                                                                                                                                                                                                    | `architecture:layer-runtime`; current source and tests             |

### Allowed variation

- Search and bootstrap may complete synchronously or asynchronously.
- Results may be grouped or ungrouped and may use default or caller-rendered
  content.
- A direct caller may anchor the popup to the input or to its own wrapper.
- Typeahead and Tokenizer may own the visible wrapper and busy-indicator lane.

### Representative states

| State             | Required invariant                                                                                                                                          | Allowed variation                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| rest              | named combobox is closed and not busy                                                                                                                       | caller-owned wrapper and label     |
| focused bootstrap | popup opens only when enabled and results exist                                                                                                             | synchronous or asynchronous source |
| query pending     | combobox is busy and duplicate stale work is rejected                                                                                                       | direct or wrapper-owned Spinner    |
| results           | one highlighted option and valid active descendant                                                                                                          | grouped/default/custom content     |
| completed empty   | a presentational message and no active descendant; today one disabled option, the FR4 gap                                                                   | caller-supplied empty text         |
| selected result   | matching option exposes `aria-selected=true`                                                                                                                | generic check presentation         |
| disabled          | focusable with `aria-disabled`; no query change, opening, or picking; an already-open list can still close; today native `disabled` by default, the FR9 gap | with or without a disabled reason  |
| dismissed pending | Escape hides the popup; a late pending response currently reopens it                                                                                        | source completion timing           |
| narrow viewport   | popup and result content remain inside two viewport gutters                                                                                                 | intrinsic or requested width       |

### Transformation and precedence order

- **ORD1 — Result content.** `item.element` → caller `renderItem` →
  TypeaheadItem. Implementation gap: a caller `renderItem` replaces
  `item.element`, which only the default TypeaheadItem renders.
- **ORD2 — Input props.** Consumer rest props → defined legacy aliases (`inputId`,
  `ariaDescribedBy`, `ariaLabelledBy`, `inputTabIndex`) → component-owned
  semantics and handlers → component styles → consumer class/style escape
  hatches. An omitted legacy alias preserves its equivalent native BaseProp.

### Performance and resources

- **PR1 — Search lifetime.** Stale responses and partial lists, including those
  from a source that has since been replaced or that arrive after unmount, are
  rejected; the debounce timer and optional
  source cancellation are cleared on replacement and unmount.

## Accessibility contract

- **AR1 — Combobox pattern.** DOM focus stays on the input while
  `aria-activedescendant` identifies the highlighted option in the named listbox.
- **AR2 — Accessible name.** A direct caller supplies `aria-label` or a valid
  `aria-labelledby` relationship; composed owners supply their visible label ID.
- **AR3 — State.** Expanded, busy, disabled, active-descendant, and selected
  states are exposed programmatically.
- **AR4 — Result feedback.** Each query announces the localized result count
  or empty-result message once, when it settles, through the shared announcer
  (`spec:AST-092` FR8).
- **AR5 — Input method.** IME composition commands remain with the candidate
  window; ordinary keyboard and pointer selection remain equivalent.

## Design relationships

| Anatomy or state     | Design requirement                                      | Representation authority         | Hierarchy role    | Component contract |
| -------------------- | ------------------------------------------------------- | -------------------------------- | ----------------- | ------------------ |
| Input                | caller-owned visible chrome and focus treatment         | Caller; OQ3                      | prominent         | AR2                |
| Loading status       | shared Spinner                                          | `component:Spinner`              | supporting        | FR6                |
| Dropdown             | Popover surface with bounded listbox                    | current source and layer runtime | prominent         | FR4, FR8           |
| Highlighted result   | overlay plus forced-color outline                       | Current source                   | prominent         | FR5                |
| Empty state          | empty-search message; today a disabled option (FR4 gap) | Current source                   | supporting        | FR4                |
| Default item content | TypeaheadItem                                           | `component:Typeahead`            | prominent         | ORD1               |
| Caller item content  | caller-owned                                            | caller                           | context-dependent | ORD1               |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Input": {
    "none": {
      "reason": "intentional: The direct caller owns the bare input chrome and styles it through supported input styling props."
    }
  },
  "Loading status": {
    "delegatesTo": {"owner": "component:Spinner", "target": "spinner"}
  },
  "Dropdown": {
    "delegatesTo": {
      "owner": "component:Typeahead",
      "target": "typeahead-dropdown"
    }
  },
  "Empty state": {
    "delegatesTo": {
      "owner": "component:Typeahead",
      "target": "typeahead-empty-state"
    }
  },
  "Result group heading": {
    "none": {
      "reason": "reachability-gap: No current public target reaches the visible group heading."
    }
  },
  "Result row": {
    "none": {
      "reason": "reachability-gap: The stable option row owns highlight and selection but has no current target."
    }
  },
  "Default item content": {
    "delegatesTo": {
      "owner": "component:Typeahead",
      "target": "typeahead-item"
    }
  },
  "Caller-rendered item content": {
    "none": {
      "reason": "intentional: Caller-rendered result content remains caller-owned."
    }
  },
  "Selected result state": {
    "none": {
      "reason": "reachability-gap: No current Typeahead target or state reaches the outer selected option."
    }
  }
}
```

## Family and system relationships

- `family:overlay-dismissal` owns Escape and platform-close ordering while the
  popup is present.
- `architecture:layer-runtime` owns top-layer hosting, anchoring, viewport
  positioning, and outside-press dismissal for a text field's layer (FR12).
- `spec:AST-092` owns incremental search results (FR10).
- `spec:AST-058` owns the empty-search message and option actions (FR4, FR11).
- `architecture:public-component-api` owns reachable exports and BaseProps
  passthrough semantics.
- `architecture:component-theming-surface` owns anatomy qualification and target
  disposition.

## Verification map

| Contract        | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Representative states                                                                                | Mutation or failure expectation                                                                                                                                                                                                                    | Audit section                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1             | `Typeahead.test.tsx` "shows results on input change", "does not select every result when items lack ids", popover-after-selection and hasSearched-reset cases                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Search, select, re-enter                                                                             | A selection that keeps the query or results open, or selects several rows, fails. Evidence gap: no test asserts focus returning to the input after a selection.                                                                                    | `audit:BaseTypeahead/behavior`      |
| FR2             | `BaseTypeahead.test.tsx` "counts grapheme clusters when enforcing minQueryLength"; `Typeahead.test.tsx` minQueryLength and paste cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Threshold, fallback below it, paste                                                                  | A search below the threshold or an empty result for an unsearched query fails. Evidence gap: no test asserts the debounce delay.                                                                                                                   | `audit:BaseTypeahead/behavior`      |
| FR3, PR1        | `Typeahead.test.tsx` out-of-order async results cases ("discards a stale response that resolves after a newer query", "discards a response from a source that was replaced while it was in flight"); `BaseTypeahead.test.tsx` source-replacement cases; `BaseTypeahead.test.tsx` "loads the replacement source when ArrowDown opens the closed field", "searches the replacement source for the typed query when ArrowDown opens the closed field"; `BaseTypeahead.incremental.test.tsx` "drops lists for a query that is no longer current (FR4)", "drops lists and rejections that arrive after unmount (FR4)" | Newer query; replaced source                                                                         | A stale response or partial list that replaces newer results, a list after unmount, or an old list on ArrowDown after a source replacement fails. Evidence gap: no test asserts timer cleanup or the Escape reopen.                                | `audit:BaseTypeahead/behavior`      |
| FR4, AR1, AR3   | `BaseTypeahead.test.tsx` "exposes a completed empty search as a disabled listbox option"; `Typeahead.test.tsx` "renders input with combobox role", "sets aria-expanded=false initially", "does not set aria-activedescendant when search has 0 results"; `BaseTypeahead.emptyState.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                                        | Results; completed empty                                                                             | An invalid listbox, an empty search with no message, or an active descendant on the message fails. Evidence gap: no test asserts `aria-selected` on the selected option. The disabled-option cases assert the current FR4 gap pending conformance. | `audit:BaseTypeahead/accessibility` |
| FR5, AR5        | `Typeahead.test.tsx` IME, focus-out, and arrow-scroll cases ("does not select the highlighted result on a composing Enter", "closes the list on the Tab keydown, before the blur it produces", "Tab from the input with the list open moves focus to the next control", "scrolls the highlighted option into view during arrow navigation", "reopens on click when the input was already focused and the dropdown closed without a blur", "picks nothing from a list opened before the field became disabled, and lets it close")                                                                                | Arrows, Enter, Tab, IME                                                                              | A composing Enter that selects, a Tab that keeps the list open or traps focus, or an Escape that leaves the list open or moves focus fails. Evidence gap: no test asserts the wrap, or Home and End.                                               | `audit:BaseTypeahead/accessibility` |
| FR6             | `Typeahead.test.tsx` busy-indicator-ownership and hasEntriesOnFocus loading cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Direct and composed busy; bootstrap                                                                  | A duplicate or missing Spinner, a stale busy state, or a repeated transition report fails.                                                                                                                                                         | `audit:BaseTypeahead/behavior`      |
| FR7, ORD2       | `BaseTypeahead.test.tsx` "forwards supported DOM, styling, and event props to the combobox input", "preserves native input attributes when legacy aliases are undefined", "lets defined legacy aliases override their native equivalents"                                                                                                                                                                                                                                                                                                                                                                        | DOM, style, events; legacy aliases                                                                   | A dropped prop, a replaced owned semantic, or a wrong alias precedence fails. Evidence gap: no test asserts that a direct caller's `onKeyDown` runs first and that `preventDefault()` in it skips the built-in handling.                           | `audit:BaseTypeahead/api`           |
| FR8             | Evidence gap: no test asserts the popup inside the viewport at 320 CSS px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                    | —                                                                                                                                                                                                                                                  | `audit:BaseTypeahead/layout`        |
| FR9             | `Typeahead.test.tsx` "disables input when isDisabled" (a bare BaseTypeahead, asserting the current native-disabled gap pending conformance), "blocks typing and selection while focusable-disabled", "opens no list and picks nothing while focusable-disabled (spec:AST-085 FR2)", "does not reopen on a click into the still-focused input once disabled", "picks nothing from a list opened before the field became disabled, and lets it close", "does not open a list for a search that settles after the field became disabled", "drops a search answer that arrives after the field became disabled"      | Native disabled; focusable-disabled before and after open                                            | Typing, opening, or selecting while focusable-disabled, a list that cannot close, or a search answer that lands after disabling fails. Evidence gap: no test asserts that caller handlers are skipped while disabled.                              | `audit:BaseTypeahead/accessibility` |
| FR10            | `BaseTypeahead.incremental.test.tsx` cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Partial, appended, failed, and replaced lists; groups; popup above and below; StrictMode             | A partial list not shown at once, a moved row or highlight, a changed option id, a second announcement, a lost list on failure, or a missing development warning fails.                                                                            | `audit:BaseTypeahead/behavior`      |
| FR11            | Evidence gap: no test, matching the source's development warning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Result with `action`                                                                                 | A rendered action or a missing warning fails.                                                                                                                                                                                                      | `audit:BaseTypeahead/behavior`      |
| FR12            | `Typeahead.test.tsx` press inside and outside suite; `Tokenizer.test.tsx` press-inside case; `TypeaheadInputPress.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Press in the input, in the list, elsewhere; a scroll that starts elsewhere; a field in a shadow root | A press on the field or in the list that closes the list, a press elsewhere that leaves it open, or a scroll that closes it fails.                                                                                                                 | —                                   |
| AR2, AR4        | `Typeahead.test.tsx` result-announcement cases ("announces the result count to a live region (comboboxes-6)", "announces the plural result count", "speaks the result count from a provider catalog", "announces \"no results found\" when the search is empty (comboboxes-6)"); `BaseTypeahead.incremental.test.tsx` "announces the result count once per query, when it settles (FR8)"                                                                                                                                                                                                                         | Counts, empty, provider catalog                                                                      | A missing or wrong announcement fails. Evidence gap: no test asserts a direct caller's accessible name.                                                                                                                                            | `audit:BaseTypeahead/accessibility` |
| ORD1            | `TypeaheadItem.test.tsx` "renders item.element raw in place of the label layout"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `item.element`                                                                                       | `item.element` that does not replace the default content fails. Evidence gap: no test asserts `renderItem` precedence below `item.element`.                                                                                                        | `audit:BaseTypeahead/behavior`      |
| Theming anatomy | `themingTargets.test.ts`; `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Mapped parts                                                                                         | A rendered class absent from the documented targets, or a stale disposition, fails.                                                                                                                                                                | `audit:BaseTypeahead/theming`       |

## Current-state impact

- **Empty-search message (FR4).** A completed empty search renders its message
  as a disabled option instead of presentational text, against `spec:AST-058`
  FR7.
- **Result content order (ORD1).** A caller `renderItem` replaces
  `item.element`, which only the default TypeaheadItem renders, although the
  `SearchableItem.element` docs give `item.element` priority.
- **Escape reopen (FR3).** A list a person dismissed with Escape reopens when a
  pending response lands.
- **Disabled input (FR9).** The default disabled mode is native `disabled`,
  which removes the Tab stop, and a focusable-disabled input still runs caller
  click, pointer, and key handlers, against `spec:AST-085` FR1 and FR2.

## Decision log

No component-local decision.

## Open questions

- **OQ1 — How should the released public props type remove package-internal
  composition knobs such as `__queryEntries`, `isFocusableDisabled`, and
  `inputTabIndex`?** (`human-api`)
- **OQ2 — Should `inputXStyle` be deprecated now that the inherited `xstyle`
  contract correctly reaches the same input?** (`human-api`)
- **OQ3 — Does bare BaseTypeahead own a default focus-visible ring, or must every
  direct caller provide the ring on its wrapper?** (`human-design`)

## Content boundary

This file does not duplicate the prop reference, examples, current audit score,
shared layer mechanics, or shared accessibility and theming rules. It links to
their owners.
