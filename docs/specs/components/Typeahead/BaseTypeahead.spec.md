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
    packages/core/src/Typeahead/BaseTypeahead.menu.test.tsx,
    packages/core/src/Typeahead/__tests__/BaseTypeaheadMenu.a11y.chromium.spec.ts,
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

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Adds the optional `menu` (listbox or dialog role) and `handleRef` (`open()`, `close()`) of DEC-1. BaseTypeahead takes a search source, controlled `value` and `onChange`, `hasEntriesOnFocus`, `minQueryLength`, debounce, result cap, `renderItem`, `size`, popup width, disabled props, and BaseProps for the input.                                                                         |
| Behavior                | A bare combobox input searches after a grapheme threshold and debounce, rejects stale responses, and shows a named listbox of options with keyboard and pointer selection; a completed empty search shows a message (today a disabled option, the FR4 gap). The menu may instead put information around the list, or show a named dialog that takes focus and returns it on close (FR13–FR16). |
| End-user impact         | People find and pick a result by typing; screen-reader users hear result counts. A natively disabled input loses its Tab stop.                                                                                                                                                                                                                                                                 |
| Builder impact          | Direct callers own the visible wrapper, label, and focus ring; Typeahead and Tokenizer compose it.                                                                                                                                                                                                                                                                                             |
| Compatibility/readiness | Additive: without `menu` and `handleRef`, no default or DOM change. The empty-search option, caller handlers while disabled, native `disabled`, and the result content order are listed under Current-state impact.                                                                                                                                                                            |
| Review checks           | Reject stale results replacing newer ones, an invalid listbox, a busy state without one Spinner, dropped BaseProps, or a popup past the viewport gutters.                                                                                                                                                                                                                                      |
| Governing rules         | `spec:AST-020` FR15; `spec:AST-085` FR1, FR2; `spec:AST-058` FR7, FR9; `spec:AST-086`; `spec:AST-092`; `family:overlay-dismissal`; `architecture:public-component-api`; `architecture:layer-runtime`.                                                                                                                                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

BaseTypeahead is the exported combobox engine beneath Typeahead and Tokenizer. It
renders a bare input, search and bootstrap behavior, keyboard navigation, a
styled result listbox, loading feedback, and selection callbacks. A direct caller
supplies the visible input wrapper, accessible name, and selected-value
presentation.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: additive. It adds the optional `menu` and
  `handleRef` props and their exported types (DEC-1); without them, no
  default or DOM changes
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
- The menu's layer in both roles: position, top layer, outside press, Escape,
  focus return, and the ARIA that ties it to the input (FR13–FR16).
- Direct-caller loading feedback when a composed wrapper does not take over the
  busy indicator lane.

**Does not own / non-goals**

- The visible input wrapper, label presentation, field border, or focus ring.
- Selected-value or token presentation in Typeahead and Tokenizer.
- Caller-rendered result content, and the caller's menu content around the
  list or inside the dialog.
- Spinner presentation, owned by `component:Spinner`.
- Shared top-layer hosting, positioning, and dismissal behavior, owned by
  `architecture:layer-runtime` and `family:overlay-dismissal`.

## Public concepts

| Concept         | Closed values or states                                       | Meaning                                                                                                         | Availability by state      | Default                          | Owner                        | Stability | Invalid-value behavior                                                                        |
| --------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------- | ---------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| selection       | `T` or `null`                                                 | Caller-controlled selected result                                                                               | all states                 | required                         | `component:BaseTypeahead`    | stable    | caller retains control                                                                        |
| search source   | `search`, `bootstrap`, optional `cancel`                      | Supplies query and focus results                                                                                | enabled input              | required                         | `component:BaseTypeahead`    | stable    | rejected work clears current results                                                          |
| focus bootstrap | on or off                                                     | Offers bootstrap results before query input                                                                     | empty focused input        | off                              | `component:BaseTypeahead`    | stable    | off keeps the menu closed                                                                     |
| query threshold | non-negative number                                           | Minimum visible-character count before search                                                                   | non-empty query            | `1`                              | `component:BaseTypeahead`    | stable    | below threshold cancels work and closes results                                               |
| debounce        | milliseconds                                                  | Delays query search                                                                                             | typed query                | `150`                            | `component:BaseTypeahead`    | stable    | non-positive runs immediately                                                                 |
| result cap      | number                                                        | Limits fetched results shown                                                                                    | completed search/bootstrap | `10`                             | `component:BaseTypeahead`    | stable    | source order is preserved                                                                     |
| result content  | default, `renderItem`, or `item.element`                      | Chooses content inside the stable option row                                                                    | result present             | default TypeaheadItem            | caller and component         | stable    | `item.element` takes precedence, except that a caller `renderItem` replaces it (the ORD1 gap) |
| disabled state  | native or focusable-disabled                                  | Blocks query mutation; native disabled blocks all activation                                                    | disabled                   | native disabled                  | component and caller wrapper | stable    | a list open before focusable-disabled applied picks nothing and can still close               |
| popup width     | intrinsic or fixed pixels                                     | Sets result popup width before viewport clamping                                                                | popup present              | intrinsic, at least anchor width | `component:BaseTypeahead`    | stable    | viewport fit wins                                                                             |
| menu            | `listbox` (optional `render`) or `dialog` (`label`, `render`) | What the anchored menu shows: the result list, the list with information around it, or content that takes focus | popup present              | `listbox`, list only             | caller and component         | stable    | TypeScript refuses a dialog without `label` or `render`                                       |
| open handle     | `open()`, `close()`; `onOpenChange` reports                   | Opens and closes the menu imperatively; there is no controlled open state                                       | enabled input              | closed                           | `component:BaseTypeahead`    | stable    | `open()` on a disabled field does nothing                                                     |
| size            | `sm`, `md`, `lg`                                              | Selects option-row padding                                                                                      | popup options              | `md`                             | `component:BaseTypeahead`    | stable    | TypeScript rejects other values                                                               |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| FR1  | The input is controlled by internal query state while `value` is caller-controlled; selecting a result calls `onChange(item)`, clears query/results, closes the popup, and returns focus to the input; a pick whose `onChange` calls the handle's `open()` keeps the popup open instead (FR16).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests                                           |
| FR2  | Search starts only at the grapheme-count threshold, uses the configured debounce, and never presents an empty result for a query that was not searched. A focus bootstrap or reload that yields no eligible choice, or fails, closes the list; a completed empty search for a typed query still shows FR4's message.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests                                           |
| FR3  | A newer query, selection, clear, source replacement, or unmount invalidates stale asynchronous work. Work still pending when the popup is dismissed settles without reopening it or leaving the field busy; a search answer for the unchanged query is kept for the next open, and an open while that search still runs waits for it. Lists for a query that is no longer current, including partial lists, are dropped (`spec:AST-092` FR4). ArrowDown on a closed field after the source was replaced searches the replacement instead of showing the old list. A query's answer that arrives after the popup was dismissed, while it stays closed, is kept, not shown. The next open by ArrowDown, by focus returning to the field, by a pointer press, or by the handle's `open()` shows the kept list, announces its count once (`spec:AST-092` FR8), and is busy only while that query's work is still pending. An empty answer reopens the popup this way only when it was kept through a dismissal. An open by any of these paths after a dismissal left the field's text unsearched (a cleared debounce or an aborted request) starts that search (FR12). | Current source and tests; `spec:AST-092` FR4                       |
| FR4  | In the listbox role (FR13), the popup is a named listbox whose result rows are options, and no active descendant is set while no option shows. A completed empty search's message MUST be presentational and announced as `spec:AST-056` AR1 requires (`spec:AST-058` FR7). Implementation gap: the message renders as one disabled option.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | APG combobox pattern; `spec:AST-058` FR7; current source and tests |
| FR5  | Arrow keys wrap the highlight; Home/End move to the first/last option; Enter selects; Escape and Tab hide the current popup, Tab moving focus on, and the dismissal holds while source work is pending (FR3); IME-owned key events do not activate combobox commands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `spec:AST-020` FR15; current source and tests                      |
| FR6  | Pending asynchronous source work sets `aria-busy` and renders one Spinner unless the composed wrapper owns the busy indicator lane; each busy transition is reported once. After the popup is dismissed while source work is pending, the control is not busy; the next open shows that work's latest list (FR3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `family:input-fields`; `spec:AST-086`; current tests               |
| FR7  | Supported BaseProps DOM, ARIA, data, class, style, event, and `xstyle` inputs reach the combobox input while component-owned role, state, value, and behavior stay authoritative; an omitted legacy alias keeps its native equivalent and a defined one overrides it. A direct caller's `onKeyDown` runs before the built-in key handling, and `preventDefault()` in it skips that handling (`architecture:public-component-api` INV7); Typeahead and Tokenizer use it for their own Escape and Backspace handling, and run their callers' `onKeyDown` after the built-in handling (`component:Typeahead` FR9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `architecture:public-component-api` INV5–INV7; current tests       |
| FR8  | The popup stays within the inline viewport at 320 CSS px, including long default results and a requested width larger than the available viewport.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source                                                     |
| FR9  | A disabled input MUST stay focusable with `aria-disabled` (`spec:AST-085` FR1), and caller handlers other than focus and blur MUST NOT run while disabled (FR2). Focusable-disabled uses `aria-disabled` plus `readOnly` and blocks text and query mutation, opening the list, and selection by Enter or a press, including from a list that was open before it applied; that list can still close, and search work in flight when it applies is dropped. Typeahead always uses focusable-disabled, and Tokenizer does except in `unfocusedLayer` mode without a `disabledMessage`, where the input is still natively `disabled`. Implementation gap: the default disabled mode is native `disabled`, which removes the Tab stop, and a focusable-disabled input still runs caller `onClick`, `onPointerDown`, and key handlers.                                                                                                                                                                                                                                                                                                                                   | `spec:AST-085` FR1, FR2; current source and tests                  |
| FR10 | A search source may show partial lists for a query through `context.update` before `search()` settles; the typeahead follows `spec:AST-092` FR1–FR10: it shows a partial list at once and stays busy until the final list, keeps shown rows and the highlight in place as later lists append, keeps an option's id while its item stays, announces once per query, when it settles or, if the popup was dismissed while it was pending, at the next open (FR3), keeps the last non-empty list when the answer fails, and warns in development when a later list moves shown rows. After the popup is dismissed while the query is pending, a partial list leaves the popup closed and the control not busy; the next open shows the query's latest list (FR3).                                                                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-092`                                                     |
| FR11 | The typeahead panel has not adopted the option-action grid: a result's `action` is not rendered, the row shows without it, and a development warning reports it once (`spec:AST-058` FR9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `spec:AST-058` FR9; current source                                 |
| FR12 | While the list is open, a press that starts and ends on the field's input or its buttons, or in the list, keeps the list open; a press that starts and ends anywhere else closes it, and a scroll or pinch that starts outside does not. A press on the field's label or a Tokenizer token moves focus out of the input and back, so the list closes and reopens on that press and ends open. A field inside an open shadow root counts the same. The list is a manual popover, because the browser's light dismiss counts a press in a text input as outside (`architecture:layer-runtime`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `architecture:layer-runtime`; current source and tests             |
| FR13 | `menu` chooses what the anchored popup shows, and BaseTypeahead owns its layer: position, top layer, outside press (FR12), Escape, focus return, and the ARIA that ties it to the input (DEC-1). `{role: 'listbox'}`, the default, shows the result list; its optional `render` receives the list, the query, the busy state, whether the search found nothing, and `close`, and places information such as a header, a footer, or a hint around the list. The list stays the only listbox and keeps FR1–FR12. Content outside the list is information only: anything a person acts on is a result in the list, so the arrow keys reach it, and a control rendered outside the list draws one development warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DEC-1                                                              |
| FR14 | `{role: 'dialog', label, render}` shows the caller's content in a `dialog` named by `label` (AR6); `render` receives the query and `close`. Focus moves to its first control, or to the dialog, when it shows. The input moves no highlight and picks nothing while it shows; Escape closes it. Only the handle opens it: a search, a focus load, a focus or ArrowDown on the input does not. It does not close when the query empties, a load finds nothing, or the input loses focus; a press outside the field and the dialog closes it (FR12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DEC-1                                                              |
| FR15 | When a dialog-role menu closes (Escape, an outside press, `close`), focus returns to the element that had focus when the menu was asked to open (`open()` called, or the menu shown), or to the input when that element is gone. A press outside that moves focus to another control leaves it there. A focus return to the input does not open the list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | DEC-1                                                              |
| FR16 | `handleRef` exposes `open()` and `close()`, and `onOpenChange` reports each open and close; there is no controlled open state (DEC-1). `open()` runs after the commit it is called in, so it uses the menu the caller rendered in the same event: a dialog opens at once, and a listbox shows its results, loading them first if needed. A pick whose `onChange` calls `open()` keeps the menu open, so switching from the list to a dialog keeps the same layer on the same anchor without closing it. When the menu stays a listbox after such a pick, focus returns to the input and the list loads its focus entries, or closes when there are none.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | DEC-1                                                              |

### Allowed variation

- Search and bootstrap may complete synchronously or asynchronously.
- Results may be grouped or ungrouped and may use default or caller-rendered
  content.
- A direct caller may anchor the popup to the input or to its own wrapper.
- The menu may be the result list alone, the list with information around it,
  or a dialog that takes focus (FR13–FR16).
- Typeahead and Tokenizer may own the visible wrapper and busy-indicator lane.

### Representative states

| State             | Required invariant                                                                                                                                          | Allowed variation                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| rest              | named combobox is closed and not busy                                                                                                                       | caller-owned wrapper and label     |
| focused bootstrap | popup opens only when enabled and results exist, and closes when a bootstrap or reload yields none or fails                                                 | synchronous or asynchronous source |
| query pending     | combobox is busy and duplicate stale work is rejected                                                                                                       | direct or wrapper-owned Spinner    |
| results           | one highlighted option and valid active descendant                                                                                                          | grouped/default/custom content     |
| completed empty   | a presentational message and no active descendant; today one disabled option, the FR4 gap                                                                   | caller-supplied empty text         |
| selected result   | matching option exposes `aria-selected=true`                                                                                                                | generic check presentation         |
| disabled          | focusable with `aria-disabled`; no query change, opening, or picking; an already-open list can still close; today native `disabled` by default, the FR9 gap | with or without a disabled reason  |
| dismissed pending | the popup stays closed and not busy; a late answer for the same query opens only on the next open                                                           | source completion timing           |
| narrow viewport   | popup and result content remain inside two viewport gutters                                                                                                 | intrinsic or requested width       |

### Transformation and precedence order

- **ORD1 — Result content.** `item.element` → caller `renderItem` →
  TypeaheadItem. Implementation gap: a caller `renderItem` replaces
  `item.element`, which only the default TypeaheadItem renders.
- **ORD2 — Input props.** Consumer rest props → defined legacy aliases (`inputId`,
  `ariaDescribedBy`, `ariaLabelledBy`, `inputTabIndex`) → component-owned
  semantics and handlers → component styles → consumer class/style escape
  hatches. An omitted legacy alias preserves its equivalent native BaseProp.
- **ORD3 — Menu content.** A listbox-role `render` wraps the result list, whose
  rows still follow ORD1; without `render` the menu is the list alone. A
  dialog-role `render` replaces the list while it shows.

### Performance and resources

- **PR1 — Search lifetime.** Stale responses and partial lists, including those
  from a source that has since been replaced or that arrive after unmount, are
  rejected; the debounce timer and optional
  source cancellation are cleared on replacement and unmount.

## Accessibility contract

- **AR1 — Combobox pattern.** In the listbox role, DOM focus stays on the
  input while `aria-activedescendant` identifies the highlighted option in the
  named listbox. A dialog-role menu takes focus instead (AR6).
- **AR2 — Accessible name.** A direct caller supplies `aria-label` or a valid
  `aria-labelledby` relationship; composed owners supply their visible label ID.
- **AR3 — State.** Expanded, busy, disabled, active-descendant, and selected
  states are exposed programmatically.
- **AR4 — Result feedback.** Each query announces the localized result count
  or empty-result message once, when it settles or, if the popup was dismissed
  while it was pending, at the next open (FR3), through the shared announcer
  (`spec:AST-092` FR8).
- **AR5 — Input method.** IME composition commands remain with the candidate
  window; ordinary keyboard and pointer selection remain equivalent.
- **AR6 — Dialog menu.** A dialog-role menu is a `dialog` named by its
  `label`; the input carries `aria-haspopup="dialog"`, `aria-expanded`, and
  `aria-controls` naming the layer that holds the dialog, and no active descendant. Focus moves
  into the dialog when it shows and returns as FR15 says.

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
  "Menu content": {
    "none": {
      "reason": "intentional: The caller renders it around the list or inside the dialog and styles it; menu styling overrides are not decided (DEC-1)."
    }
  },
  "Menu dialog": {
    "none": {
      "reason": "intentional: The dialog role's surface is the popover's own; menu styling overrides are not decided (DEC-1)."
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

| Contract         | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Representative states                                                                                                                                            | Mutation or failure expectation                                                                                                                                                                                                                      | Audit section                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1              | `Typeahead.test.tsx` "shows results on input change", "does not select every result when items lack ids", popover-after-selection and hasSearched-reset cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Search, select, re-enter                                                                                                                                         | A selection that keeps the query or results open, or selects several rows, fails. Evidence gap: no test asserts focus returning to the input after a selection.                                                                                      | `audit:BaseTypeahead/behavior`      |
| FR2              | `BaseTypeahead.test.tsx` "counts grapheme clusters when enforcing minQueryLength"; `Typeahead.test.tsx` minQueryLength and paste cases; `BaseTypeahead.test.tsx` "focus list with no choices" cases and "closes an open focus list when the reload fails"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Threshold, fallback below it, paste                                                                                                                              | A search below the threshold or an empty result for an unsearched query fails. Evidence gap: no test asserts the debounce delay.                                                                                                                     | `audit:BaseTypeahead/behavior`      |
| FR3, PR1         | `Typeahead.test.tsx` out-of-order async results cases ("discards a stale response that resolves after a newer query", "discards a response from a source that was replaced while it was in flight"); `BaseTypeahead.test.tsx` source-replacement cases; `BaseTypeahead.test.tsx` "loads the replacement source when ArrowDown opens the closed field", "searches the replacement source for the typed query when ArrowDown opens the closed field"; `BaseTypeahead.incremental.test.tsx` "drops lists for a query that is no longer current (FR4)", "drops lists and rejections that arrive after unmount (FR4)"; `BaseTypeahead.test.tsx` "BaseTypeahead pending work after a dismissal" cases; `Tokenizer.test.tsx` "keeps a dismissed menu closed when its search answers late, and shows that answer on reopen" | Newer query; replaced source; dismissal while pending                                                                                                            | A stale response or partial list that replaces newer results, a list after unmount, an old list on ArrowDown after a source replacement, or a popup that reopens or stays busy after a dismissal fails. Evidence gap: no test asserts timer cleanup. | `audit:BaseTypeahead/behavior`      |
| FR3              | `BaseTypeahead.test.tsx` "every open path after a dismissal shows the kept list at once" cases; `BaseTypeahead.test.tsx` "searches the typed text when a press on the field's label dismissed it inside the debounce"; `Tokenizer.test.tsx` "searches the typed text when a press on a token dismissed it inside the debounce"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ArrowDown, focus return, pointer press, and `open()` after a dismissal, with the search pending or settled; an empty settled answer not kept through a dismissal | An open path that waits for the answer, searches again, stays busy after the query settled, announces the kept count twice or not at all, or reopens an empty answer that was not kept fails.                                                        | `audit:BaseTypeahead/behavior`      |
| FR4, AR1, AR3    | `BaseTypeahead.test.tsx` "exposes a completed empty search as a disabled listbox option"; `Typeahead.test.tsx` "renders input with combobox role", "sets aria-expanded=false initially", "does not set aria-activedescendant when search has 0 results"; `BaseTypeahead.emptyState.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Results; completed empty                                                                                                                                         | An invalid listbox, an empty search with no message, or an active descendant on the message fails. Evidence gap: no test asserts `aria-selected` on the selected option. The disabled-option cases assert the current FR4 gap pending conformance.   | `audit:BaseTypeahead/accessibility` |
| FR5, AR5         | `Typeahead.test.tsx` IME, focus-out, and arrow-scroll cases ("does not select the highlighted result on a composing Enter", "closes the list on the Tab keydown, before the blur it produces", "Tab from the input with the list open moves focus to the next control", "scrolls the highlighted option into view during arrow navigation", "reopens on click when the input was already focused and the dropdown closed without a blur", "picks nothing from a list opened before the field became disabled, and lets it close")                                                                                                                                                                                                                                                                                   | Arrows, Enter, Tab, IME                                                                                                                                          | A composing Enter that selects, a Tab that keeps the list open or traps focus, or an Escape that leaves the list open or moves focus fails. Evidence gap: no test asserts the wrap, or Home and End.                                                 | `audit:BaseTypeahead/accessibility` |
| FR6              | `Typeahead.test.tsx` busy-indicator-ownership and hasEntriesOnFocus loading cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Direct and composed busy; bootstrap                                                                                                                              | A duplicate or missing Spinner, a stale busy state, or a repeated transition report fails.                                                                                                                                                           | `audit:BaseTypeahead/behavior`      |
| FR7, ORD2        | `BaseTypeahead.test.tsx` "forwards supported DOM, styling, and event props to the combobox input", "preserves native input attributes when legacy aliases are undefined", "lets defined legacy aliases override their native equivalents"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | DOM, style, events; legacy aliases                                                                                                                               | A dropped prop, a replaced owned semantic, or a wrong alias precedence fails. Evidence gap: no test asserts that a direct caller's `onKeyDown` runs first and that `preventDefault()` in it skips the built-in handling.                             | `audit:BaseTypeahead/api`           |
| FR8              | Evidence gap: no test asserts the popup inside the viewport at 320 CSS px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                | —                                                                                                                                                                                                                                                    | `audit:BaseTypeahead/layout`        |
| FR9              | `Typeahead.test.tsx` "disables input when isDisabled" (a bare BaseTypeahead, asserting the current native-disabled gap pending conformance), "blocks typing and selection while focusable-disabled", "opens no list and picks nothing while focusable-disabled (spec:AST-085 FR2)", "does not reopen on a click into the still-focused input once disabled", "picks nothing from a list opened before the field became disabled, and lets it close", "does not open a list for a search that settles after the field became disabled", "drops a search answer that arrives after the field became disabled"                                                                                                                                                                                                         | Native disabled; focusable-disabled before and after open                                                                                                        | Typing, opening, or selecting while focusable-disabled, a list that cannot close, or a search answer that lands after disabling fails. Evidence gap: no test asserts that caller handlers are skipped while disabled.                                | `audit:BaseTypeahead/accessibility` |
| FR10             | `BaseTypeahead.incremental.test.tsx` cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Partial, appended, failed, and replaced lists; groups; popup above and below; StrictMode                                                                         | A partial list not shown at once, a moved row or highlight, a changed option id, a second announcement, a lost list on failure, or a missing development warning fails.                                                                              | `audit:BaseTypeahead/behavior`      |
| FR11             | Evidence gap: no test, matching the source's development warning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Result with `action`                                                                                                                                             | A rendered action or a missing warning fails.                                                                                                                                                                                                        | `audit:BaseTypeahead/behavior`      |
| FR12             | `Typeahead.test.tsx` press inside and outside suite; `Tokenizer.test.tsx` press-inside case; `TypeaheadInputPress.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Press in the input, in the list, elsewhere; a scroll that starts elsewhere; a field in a shadow root                                                             | A press on the field or in the list that closes the list, a press elsewhere that leaves it open, or a scroll that closes it fails.                                                                                                                   | —                                   |
| FR13, FR16, ORD3 | `BaseTypeahead.menu.test.tsx` "shows information around the result list, and the list stays the only listbox", "warns in development when a control sits outside the result list", "keeps the menu open when a pick switches it to a dialog", "reloads the focus entries, with focus back in the input", "closes with focus in the input when there are no focus entries"; `BaseTypeaheadMenu.a11y.chromium.spec.ts` keyboard and role-switch cases in Chromium                                                                                                                                                                                                                                                                                                                                                     | Header and footer around the list; a control outside it; a pick that switches to a dialog                                                                        | A second listbox, information inside the list, an unreached result, a missing warning, or a layer that hides between the list and the dialog fails.                                                                                                  | `audit:BaseTypeahead/behavior`      |
| FR14, FR15, AR6  | `BaseTypeahead.menu.test.tsx` dialog-role cases, including "closes on a press outside the field and the dialog, and keeps a press inside" and "opens only from the handle: typing, focus and ArrowDown leave it closed"; `BaseTypeaheadMenu.a11y.chromium.spec.ts` focus-return and outside-press cases in Chromium                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Open from a button; Escape; close with the opener gone; an emptied query; a blur of the input                                                                    | An unnamed dialog, a missing `aria-haspopup`, an active descendant, focus that stays outside, focus that lands on the page, a dialog that closes on an empty query or a blur, stays open after a press outside, or opens from typing or focus fails. | `audit:BaseTypeahead/accessibility` |
| AR2, AR4         | `Typeahead.test.tsx` result-announcement cases ("announces the result count to a live region (comboboxes-6)", "announces the plural result count", "speaks the result count from a provider catalog", "announces \"no results found\" when the search is empty (comboboxes-6)"); `BaseTypeahead.incremental.test.tsx` "announces the result count once per query, when it settles (FR8)"                                                                                                                                                                                                                                                                                                                                                                                                                            | Counts, empty, provider catalog                                                                                                                                  | A missing or wrong announcement fails. Evidence gap: no test asserts a direct caller's accessible name.                                                                                                                                              | `audit:BaseTypeahead/accessibility` |
| ORD1             | `TypeaheadItem.test.tsx` "renders item.element raw in place of the label layout"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `item.element`                                                                                                                                                   | `item.element` that does not replace the default content fails. Evidence gap: no test asserts `renderItem` precedence below `item.element`.                                                                                                          | `audit:BaseTypeahead/behavior`      |
| Theming anatomy  | `themingTargets.test.ts`; `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Mapped parts                                                                                                                                                     | A rendered class absent from the documented targets, or a stale disposition, fails.                                                                                                                                                                  | `audit:BaseTypeahead/theming`       |

## Current-state impact

- **Active option perception.** The active option shows only the
  `--color-overlay-hover` fill, under 3:1 against the listbox in light and
  dark, against `spec:AST-020` FR1 (WCAG 2.2 1.4.11). Selector draws the
  shared focus ring after keyboard input (`component:Selector` AR5).
- **Empty-search message (FR4).** A completed empty search renders its message
  as a disabled option instead of presentational text, against `spec:AST-058`
  FR7.
- **Result content order (ORD1).** A caller `renderItem` replaces
  `item.element`, which only the default TypeaheadItem renders, although the
  `SearchableItem.element` docs give `item.element` priority.
- **Disabled input (FR9).** The default disabled mode is native `disabled`,
  which removes the Tab stop, and a focusable-disabled input still runs caller
  click, pointer, and key handlers, against `spec:AST-085` FR1 and FR2.

## Decision log

### DEC-1 — Astryx owns the typeahead menu's layer, and callers fill it

**Decider:** `cixzhang`, `2026-11-07` (row 49: "49 A")

The layer holds what screen-reader and keyboard users rely on: the menu's
role and name, where focus goes back to, what a press outside does, the order
in which Escape closes layers, and whether the menu stays above a Dialog. So
BaseTypeahead owns the layer, and a caller fills it through one `menu` config
that carries the role, the name and the content together (FR13–FR16). The
name matches the public `menuWidth` ("Okay menu"); the shape is one config
with the label inside ("I like the config idea"); focus return is one generic
rule ("Generic rule sounds good"); and the open state is reported, not
controlled, as in ComplexSelector ("Okay for open").

Rejected: callers composing the layer from spread props (Downshift style),
because one missed spread removes the role, the name or the focus return with
no visible sign. Rejected for now: typed layer options (width, placement,
maximum height) in the config, which no caller needs today and can be added
later without a break. Not included: a controlled `isOpen`, and an
`onTokenActivate` callback.

**Note (not decided).** Menu styling overrides may be added later (for
example part styling or theme targets); they are out of scope now (Cindy:
"49A we may add menu styling overrides").

### DEC-2 — No `controlRef` on TextInput

**Decider:** `cixzhang`, `2026-11-06`

TextInput does not expose a ref to its bordered control box for anchoring a
Popover: that route handles none of the necessary accessibility for that
experience (combobox role, active option, keyboard model, result
announcements). A custom typeahead uses BaseTypeahead with `anchorRef` and
the `menu` config.

Rejected: a `controlRef` on TextInput.

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
