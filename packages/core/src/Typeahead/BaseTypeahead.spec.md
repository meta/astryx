---
schema_version: 3
template_version: 4
kind: component
id: component:BaseTypeahead
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Typeahead/BaseTypeahead.test.tsx,
    packages/core/src/Typeahead/Typeahead.test.tsx,
    packages/core/src/Tokenizer/Tokenizer.test.tsx,
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
system_specs: []
---

# BaseTypeahead component contract

## Intent

BaseTypeahead is the exported combobox engine beneath Typeahead and Tokenizer. It
renders a bare input, search and bootstrap behavior, keyboard navigation, a
styled result listbox, loading feedback, and selection callbacks. A direct caller
supplies the visible input wrapper, accessible name, and selected-value
presentation.

This draft records verified shipped or audit-remediated behavior. It does not
approve a new prop, default, compatibility promise, visual treatment, or
ownership boundary.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: patch corrections preserve the existing public surface
- Controlled/uncontrolled behavior: controlled `value` remains unchanged
- Migration decision: none; unresolved public-surface cleanup requires a
  separate compatibility decision

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

| Concept         | Closed values or states                  | Meaning                                                      | Availability by state      | Default                          | Owner                        | Stability | Invalid-value behavior                                                          |
| --------------- | ---------------------------------------- | ------------------------------------------------------------ | -------------------------- | -------------------------------- | ---------------------------- | --------- | ------------------------------------------------------------------------------- |
| selection       | `T` or `null`                            | Caller-controlled selected result                            | all states                 | required                         | `component:BaseTypeahead`    | released  | caller retains control                                                          |
| search source   | `search`, `bootstrap`, optional `cancel` | Supplies query and focus results                             | enabled input              | required                         | `component:BaseTypeahead`    | released  | rejected work clears current results                                            |
| focus bootstrap | on or off                                | Offers bootstrap results before query input                  | empty focused input        | off                              | `component:BaseTypeahead`    | released  | off keeps the menu closed                                                       |
| query threshold | non-negative number                      | Minimum visible-character count before search                | non-empty query            | `1`                              | `component:BaseTypeahead`    | released  | below threshold cancels work and closes results                                 |
| debounce        | milliseconds                             | Delays query search                                          | typed query                | `150`                            | `component:BaseTypeahead`    | released  | non-positive runs immediately                                                   |
| result cap      | number                                   | Limits fetched results shown                                 | completed search/bootstrap | `10`                             | `component:BaseTypeahead`    | released  | source order is preserved                                                       |
| result content  | default, `renderItem`, or `item.element` | Chooses content inside the stable option row                 | result present             | default TypeaheadItem            | caller and component         | released  | `item.element` takes precedence                                                 |
| disabled state  | native or focusable-disabled             | Blocks query mutation; native disabled blocks all activation | disabled                   | native disabled                  | component and caller wrapper | released  | a list open before focusable-disabled applied picks nothing and can still close |
| popup width     | intrinsic or fixed pixels                | Sets result popup width before viewport clamping             | popup present              | intrinsic, at least anchor width | `component:BaseTypeahead`    | released  | viewport fit wins                                                               |
| size            | `sm`, `md`, `lg`                         | Selects option-row padding                                   | popup options              | `md`                             | `component:BaseTypeahead`    | released  | TypeScript rejects other values                                                 |

## Behavioral and layout contract

Draft requirements identify their observational or current-authority basis.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                        | Basis                                                 | Draft review state                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| FR1 | The input is controlled by internal query state while `value` is caller-controlled; selecting a result calls `onChange(item)`, clears query/results, closes the popup, and returns focus to the input.                                                                                                     | Current source and tests                              | verified shipped behavior                      |
| FR2 | Search starts only at the grapheme-count threshold, uses the configured debounce, and never presents an empty result for a query that was not searched.                                                                                                                                                    | Public API, current i18n character utility, tests     | verified audit remediation                     |
| FR3 | A newer query, selection, clear, source replacement, or unmount invalidates stale asynchronous work. Escape hides the current popup but does not invalidate pending work, so a late response currently reopens it (retained violation).                                                                    | Current source, focused retained-red probe, and tests | verified shipped behavior                      |
| FR4 | The popup is a named listbox whose result rows are options. A completed empty search renders one disabled option so the listbox retains a valid owned child.                                                                                                                                               | APG combobox pattern, axe, tests                      | verified audit remediation                     |
| FR5 | Arrow keys wrap the highlight; Home/End move to the first/last option; Enter selects; Escape and Tab hide the current popup; IME-owned key events do not activate combobox commands. Escape dismissal is not durable while source work remains pending (FR3).                                              | Current source and tests                              | verified shipped behavior; Escape gap retained |
| FR6 | Pending asynchronous source work sets `aria-busy` and renders one named Spinner unless the composed wrapper owns the busy indicator lane.                                                                                                                                                                  | Current source, input-family FR7, tests               | verified shipped behavior                      |
| FR7 | Supported BaseProps DOM, ARIA, data, class, style, event, and `xstyle` inputs reach the combobox input while component-owned role, state, value, and behavior remain authoritative.                                                                                                                        | `architecture:public-component-api/INV5–INV7`, tests  | verified audit remediation                     |
| FR8 | The popup remains within the inline viewport at 320 CSS px, including long default results and a requested width larger than the available viewport.                                                                                                                                                       | WCAG 1.4.10, real Chromium                            | verified audit remediation                     |
| FR9 | Native disabled removes ordinary focus and activation. Focusable-disabled uses `aria-disabled` plus `readOnly` and blocks text/query mutation, opening the list, and selection by Enter or a press, including from a list that was open before it applied; that list can still close (`spec:AST-085` FR2). | Current source and tests                              | verified shipped behavior                      |

### Allowed variation

- Search and bootstrap may complete synchronously or asynchronously.
- Results may be grouped or ungrouped and may use default or caller-rendered
  content.
- A direct caller may anchor the popup to the input or to its own wrapper.
- Typeahead and Tokenizer may own the visible wrapper and busy-indicator lane.

### Representative states

| State             | Required invariant                                                                                                               | Allowed variation                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| rest              | named combobox is closed and not busy                                                                                            | caller-owned wrapper and label         |
| focused bootstrap | popup opens only when enabled and results exist                                                                                  | synchronous or asynchronous source     |
| query pending     | combobox is busy and duplicate stale work is rejected                                                                            | direct or wrapper-owned Spinner        |
| results           | one highlighted option and valid active descendant                                                                               | grouped/default/custom content         |
| completed empty   | one disabled empty option; no active descendant                                                                                  | caller-supplied empty text             |
| selected result   | matching option exposes `aria-selected=true`                                                                                     | generic check presentation             |
| disabled          | native disabled blocks activation; focusable-disabled blocks query mutation, opening and picking, also from an already-open list | native or focusable-disabled semantics |
| dismissed pending | Escape hides the popup; a late pending response currently reopens it                                                             | source completion timing               |
| narrow viewport   | popup and result content remain inside two viewport gutters                                                                      | intrinsic or requested width           |

### Transformation and precedence order

- **ORD1 — Result content.** `item.element` → caller `renderItem` →
  TypeaheadItem.
- **ORD2 — Input props.** Consumer rest props → defined legacy aliases (`inputId`,
  `ariaDescribedBy`, `ariaLabelledBy`, `inputTabIndex`) → component-owned
  semantics and handlers → component styles → consumer class/style escape
  hatches. An omitted legacy alias preserves its equivalent native BaseProp.

### Performance and resources

- **PR1 — Search lifetime.** One generation counter rejects stale responses,
  including responses from a source that has since been replaced; debounce
  timers and optional source cancellation are cleared on replacement and
  unmount.

## Accessibility contract

- **AR1 — Combobox pattern.** DOM focus stays on the input while
  `aria-activedescendant` identifies the highlighted option in the named listbox.
- **AR2 — Accessible name.** A direct caller supplies `aria-label` or a valid
  `aria-labelledby` relationship; composed owners supply their visible label ID.
- **AR3 — State.** Expanded, busy, disabled, active-descendant, and selected
  states are exposed programmatically.
- **AR4 — Result feedback.** Active queries announce the localized result count
  or empty-result message through the shared announcer.
- **AR5 — Input method.** IME composition commands remain with the candidate
  window; ordinary keyboard and pointer selection remain equivalent.

## Design relationships

| Anatomy or state     | Design requirement                              | Representation authority         | Hierarchy role    | Component contract |
| -------------------- | ----------------------------------------------- | -------------------------------- | ----------------- | ------------------ |
| Input                | caller-owned visible chrome and focus treatment | unsettled ownership for bare use | prominent         | AR2                |
| Loading status       | shared Spinner                                  | `component:Spinner`              | supporting        | FR6                |
| Dropdown             | Popover surface with bounded listbox            | current source and layer runtime | prominent         | FR4, FR8           |
| Highlighted result   | overlay plus forced-color outline               | objective accessibility standard | prominent         | FR5                |
| Empty state          | disabled option message                         | APG/axe                          | supporting        | FR4                |
| Default item content | TypeaheadItem                                   | `component:Typeahead`            | prominent         | ORD1               |
| Caller item content  | caller-owned                                    | caller                           | context-dependent | ORD1               |

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
  positioning, and native light dismissal.
- `architecture:public-component-api` owns reachable exports and BaseProps
  passthrough semantics.
- `architecture:component-theming-surface` owns anatomy qualification and target
  disposition.

## Verification map

| Contract        | Verification                                           | Representative states                                     | Mutation or failure expectation                                        | Audit section                    |
| --------------- | ------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| FR1–FR2         | BaseTypeahead and Typeahead tests                      | query, overlap, select, clear                             | current work replaces newer results or selection does not close        | `audit:BaseTypeahead/behavior`   |
| FR3             | shared stale-response tests plus retained-red probe    | newer query, clear, unmount, Escape while pending         | late work replaces current results or reopens after explicit dismissal | `audit:BaseTypeahead/a11y`       |
| FR4, AR1–AR4    | focused tests, component-scoped axe, live-region tests | results, empty, busy, selected                            | invalid listbox ownership or state/announcement disappears             | `audit:BaseTypeahead/a11y`       |
| FR5, AR5        | keyboard, focus-out, IME, and retained-red tests       | arrows, Home/End, Enter, Escape, Tab, composition         | command selects or dismisses at the wrong time                         | `audit:BaseTypeahead/a11y`       |
| FR6             | busy-lane tests                                        | direct and composed pending source                        | duplicate/missing Spinner or stale busy state                          | `audit:BaseTypeahead/a11y`       |
| FR7             | focused passthrough tests and strict lint              | native-only, alias collisions, DOM/style/events           | supported consumer input is dropped or owned semantics are replaced    | `audit:BaseTypeahead/api`        |
| FR8             | real-Chromium 320px sensor receipt                     | long result, wide request, LTR/RTL                        | popup or its content crosses either viewport gutter                    | `audit:BaseTypeahead/responsive` |
| FR9             | shared disabled tests                                  | native disabled; focusable-disabled before and after open | disabled mode mutates query, opens the list, or accepts a selection    | `audit:BaseTypeahead/a11y`       |
| Theming anatomy | knowledge and theming-target checks                    | all mapped parts                                          | target inventory or disposition drifts                                 | `audit:BaseTypeahead/theming`    |

## Decision log

None. This draft records current or objectively remediated behavior and makes no
component-local API, design, compatibility, or ownership decision.

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
shared layer mechanics, or shared accessibility and theming rules.
