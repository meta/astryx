---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-011
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-31
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:public-component-api]
affects_families: [family:input-fields]
affects_contributing: []
affects_consumer_docs: [Selector, MultiSelector]
---

# Read-only selection inputs

## Intent

People should be able to review and submit a selected value that policy or
permissions prevent them from changing. Selector and MultiSelector should expose
that state as read-only rather than disabled, without offering a menu that cannot
change the value.

## Non-goals

- Adding read-only behavior to every input-family member in this change.
- Changing disabled, disabled-reason, loading, validation, or option-source state.
- Adding read-only explanation text or a tooltip API.
- Changing selected-value rendering, option rendering, or form serialization.

## Requirements

- **FR1 — Read-only preserves the value.** With `isReadOnly`, the current value
  MUST remain visible at full opacity, focusable in the ordinary tab order, and
  included in form submission. It MUST NOT invoke `onChange` or `changeAction`.
- **FR2 — Read-only exposes no selection surface.** Pointer, keyboard, typeahead,
  search, and `isDefaultOpen` MUST NOT open or render the Popover or BottomSheet
  selection surface while read-only.
- **FR3 — Editing affordances are absent.** Clear actions and the disclosure
  indicator MUST NOT render while read-only. Status and busy presentation remain
  independent because they describe the preserved value rather than an available
  edit.
- **FR4 — Accessibility matches behavior.** The focusable read-only value MUST
  retain `combobox` semantics, expose `aria-readonly="true"` and
  `aria-expanded="false"`, and preserve its accessible name and rendered value.
  It MUST NOT expose `aria-controls` or `aria-activedescendant` when no selection
  surface exists. The combobox role's implicit listbox popup describes the
  control's selection capability; `aria-readonly` communicates that the value
  cannot currently be changed. When a supported accessibility tree does not map
  that ARIA property for the trigger's host element, a localized accessible
  description MUST additionally announce the read-only state. Search-enabled and
  non-search selectors use the same read-only combobox semantics because neither
  exposes a search or selection surface in this state.
- **FR5 — Disabled takes precedence.** When `isDisabled` and `isReadOnly` are both
  true, disabled focus, interaction, appearance, accessibility, and form-submission
  behavior win.
- **IR1 — The public API follows the input convention.** Selector and
  MultiSelector MUST use the established optional `isReadOnly` boolean and expose
  the existing `readonly` theme state on their root targets.
- **IR2 — Read-only is not disabled paint.** Implementations MUST NOT reuse
  disabled opacity or disabled form behavior for read-only state. They MAY remove
  hover, pressed, and pointer affordances that would falsely imply editability.

### Platform support

- Supported feature/engine floor: every browser and assistive-technology
  combination supported by Astryx Core.
- WCAG baseline: [WCAG 2.2 SC 4.1.2](https://www.w3.org/TR/WCAG22/#name-role-value)
  requires the control's name, role, value, and state to be programmatically
  determinable. The retained `combobox` role, rendered value, and
  `aria-readonly="true"` state satisfy that contract without changing the
  control's programmatic identity.
- ARIA contract: [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/#aria-readonly)
  supports `aria-readonly` on `combobox` and defines read-only as a value the user
  can read but cannot set. A combobox has an implicit
  `aria-haspopup="listbox"`; that capability metadata remains valid even though
  read-only interaction never opens the surface.
- Browser evidence: DOM inspection MUST expose `aria-readonly="true"` and no
  nonexistent controlled surface. Chromium accessibility inspection MUST expose a
  focusable, collapsed combobox with the correct name and rendered value; its
  implicit popup remains `listbox`, and its accessible description MUST announce
  the localized read-only state because Chromium does not map `aria-readonly` on
  the button host. Pointer and keyboard probes MUST confirm that no selection
  surface opens and no value changes.

## Current-state impact

- TextInput, TextArea, NumberInput, CheckboxInput, and CheckboxList already
  establish `isReadOnly` as the input-family name for visible, focusable,
  non-editable values.
- Selector and MultiSelector currently expose only disabled state. Their triggers
  can open a selection surface, their clear actions can change the value, and
  their form carriers are removed only when disabled.
- The caller owns whether a selected value is policy- or permission-locked; the
  components cannot derive that distinction from the value, options, loading
  state, or layout. The prop therefore satisfies `spec:AST-002` public-prop
  admission.
- Implementation updates both component contracts, consumer docs, focused tests,
  and theme-state metadata in the same pull request.

## Verification

| Contract | Verification                                        | Representative states                                        | Mutation or failure expectation                                                                                               |
| -------- | --------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR5 | Focus, callback, and form-participation tests       | read-only; disabled; both; single and multiple values        | A read-only value changes, leaves the tab order, fails to submit, dims, or overrides disabled behavior                        |
| FR2, FR3 | Pointer/keyboard/typeahead and DOM affordance tests | popover, bottom sheet, adaptive, search, clear, default-open | A read-only trigger opens or renders a surface, clears a value, or displays a disclosure indicator                            |
| FR4      | DOM and real-browser accessibility inspection       | search and non-search triggers; standalone and InputGroup    | The value changes role, loses its name/value/read-only state, appears expanded, or points at a nonexistent controlled surface |
| IR1, IR2 | Theme-state and rendered-style tests                | input and ghost variants                                     | The root omits `data-readonly`, gains disabled opacity, or keeps interactive hover/pressed cues                               |

## Decision log

### DEC-1 — Selection inputs use the established read-only contract

**Reference:** `spec:AST-011/DEC-1`
**Decider:** `cixzhang`, `2026-08-31`

Selector and MultiSelector accept `isReadOnly` when the caller owns a value that
must remain visible and submitted but cannot be changed. Read-only controls stay
focusable, retain their combobox identity, expose their rendered content as the
value, and publish `aria-readonly="true"`, while selection and editing affordances
are absent.

The retained role follows WCAG 2.2 SC 4.1.2's stable programmatic name, role,
value, and state contract and WAI-ARIA 1.2's explicit support for
`aria-readonly` on `combobox`. [MUI Select](https://github.com/mui/material-ui/blob/bddf22f5c6d4c4383aae88dbd77b6c7a53c5fd17/packages/mui-material/src/Select/SelectInput.js#L841-L853)
and [React Aria ComboBox](https://github.com/adobe/react-spectrum/blob/7c6100839de0f53bfa3c4e2f99529bdaa96bf205/packages/react-aria/src/combobox/useComboBox.ts#L143-L151)
use the same shape: a read-only combobox remains identifiable as a combobox while
pointer and keyboard opening are blocked. The implicit listbox popup describes
the widget's selection capability; it does not promise that every state can open
it.

Rejected: mapping this state to `isDisabled`, because disabled values are dimmed
and excluded from form submission.

## Open questions

None.
