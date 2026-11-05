---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-085
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-21
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:interaction-modality]
affects_families: [family:buttons, family:input-fields]
affects_contributing: []
affects_consumer_docs:
  [
    Button,
    ButtonGroup,
    IconButton,
    ClickableCard,
    Collapsible,
    CheckboxInput,
    CheckboxList,
    DateInput,
    DateRangeInput,
    DateTimeInput,
    FileInput,
    MultiSelector,
    NumberInput,
    PowerSearch,
    RadioList,
    RichTextEditor,
    SegmentedControl,
    Selector,
    Slider,
    Switch,
    TextArea,
    TextInput,
    TimeInput,
    Tokenizer,
    Typeahead,
    BaseTypeahead,
    CommentPin,
    useInteractiveRole,
    useIndicatorFocusRing,
    useMenuPress,
  ]
---

# Focusable disabled controls system spec

## Intent

Keyboard and screen-reader users can always reach a disabled control. They can
find it, hear that it is disabled, and read why when a reason exists. They never
lose their place when the control they are on becomes disabled.

Builders keep using `isDisabled`. Astryx components turn it into a focusable,
non-operable control. No component renders the native `disabled` attribute.

## Non-goals

- Which items arrow keys visit inside a composite widget whose arrows select
  (radio group, segmented control, tablist, listbox) or pick a value (grid,
  calendar, wheel). The composite's own record decides that. FR8 decides it
  for action composites.
- Read-only. `spec:AST-011` keeps read-only distinct from disabled.
- Disabled paint, tokens, and theme states. They keep their current owners.
- Elements a caller renders inside an Astryx slot. The caller owns their
  attributes.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Disabled controls stay focusable.** A component MUST NOT put the
  native `disabled` attribute on any element it renders. A disabled control
  exposes `aria-disabled="true"` and keeps the focus order it has when enabled:
  a tab stop stays a tab stop, and an element with `tabIndex={-1}` stays out of
  the tab order.
- **FR2 — Disabled blocks every change.** A disabled control MUST NOT change its
  value, activate, navigate, open a surface, or invoke a callback or Action.
  This covers pointer, touch, Enter, Space, typing, paste, drop, drag, wheel,
  increment, and selection paths.
- **FR3 — Disabled values are not submitted.** A disabled field contributes no
  value to form submission and does not block submission through constraint
  validation. This matches native `disabled` form behavior.
- **FR4 — Becoming disabled keeps focus.** A control that becomes disabled while
  it holds focus keeps focus. A component MAY instead move focus, before the
  change, to a destination its own record names inside the same component. When
  a component removes a focused control, that component's record names the
  destination.
- **FR5 — Disabled state is announced.** The disabled state is exposed to
  assistive technology on the focusable element itself, together with its
  accessible name and any description or disabled reason. When a focused
  control becomes disabled, the change is exposed on that element; whether it is
  spoken follows `spec:AST-009`.
- **FR6 — Disabled stays visibly inert.** Disabled paint applies to the
  disabled state. A control that is busy but not disabled keeps its pending
  treatment (`family:buttons` FR4), even though it also exposes
  `aria-disabled`. Hover, pressed, and drag affordances MUST
  NOT appear. The focus indicator still appears under keyboard modality
  (`architecture:interaction-modality` INV1, INV5).
- **FR7 — Group disablement follows the same rule.** Members disabled by a group
  or form-level default follow FR1–FR6.
- **FR8 — Action composites reach a disabled member.** In a composite whose
  members are actions and whose arrow keys move focus without activating
  (a menu, a toolbar, a button group), arrow keys, Home, End, and type-ahead
  visit a disabled member. It takes focus, is announced as disabled with its
  reason (FR5), and does nothing when activated (FR2). The composite's single
  Tab stop still starts on an enabled member. A wholly disabled composite
  keeps its Tab stop (FR1, FR7).

### Platform support

- Supported feature/engine floor: the package's supported browsers.
- Unsupported behavior: none. The rule uses standard ARIA and event handling.
- Browser evidence: keyboard focus order and blocked activation need real
  browser checks; FR5 needs accessibility-tree evidence. Spoken output follows
  `spec:AST-009` only when a claim depends on it.

## Current-state impact

- `family:buttons` FR3 changes from "MAY use focusable `aria-disabled`" to
  "follows `spec:AST-085`". Button already does this for busy and tooltip cases.
- `family:input-fields` FR4 is satisfied for every member. "Focusable enough"
  becomes "focusable".
- `component:DateRangeInput` AR3 and its disabled-preset state, and
  `component:Tokenizer`'s disabled state and verification, follow this record
  instead of native `disabled`. Their tests that assert native disabled are
  pending conformance.
- `component:Slider` AR1: a disabled thumb without a message gains a Tab stop;
  its disabled-thumb tests are pending conformance.
- `component:Selector`: a disabled trigger with a reason keeps its Tab stop, as
  every disabled trigger now does.
- Consumer docs that describe disabled controls as natively disabled, not
  focusable, out of the tab order, dropping focus, or swallowing the events an
  external Tooltip needs change with conformance work. The record's
  `affects_consumer_docs` list names each one.
- `BaseTypeahead`'s public `isFocusableDisabled` has no remaining effect: every
  disabled input is focusable (FR1), and Enter cannot select while disabled
  (FR2). It stays accepted until a public-API change under `spec:AST-002`
  removes it.
- `useIndicatorFocusRing`: its `isDisabled` input suppresses the keyboard focus
  ring. Under FR6 a focused disabled control still shows it.
- `family:buttons` and `component:Tokenizer` tests that assert native disabled
  are pending conformance.
- Draft records for ClickableCard, BaseTypeahead, CheckboxInput, ChatComposer,
  and CommentPin describe native `disabled` as observed behavior; they change
  with conformance work.
- `spec:AST-011` DEC-1's rejected line no longer says disabled values leave the
  tab order.
- `spec:AST-011` FR5 stays true: disabled focus, submission, and paint still win
  over read-only.
- Components that render native `disabled` today switch to the FR1 shape. Text
  fields use read-only plus change guards, as TextInput does with a disabled
  reason. Fields with a form value drop it from submission (FR3).
- Pagination, Calendar, Lightbox, and the touch date pickers stop dropping focus
  to the page body at their boundaries (FR4).
- FR8 extends `component:DropdownMenu` DEC-11 from menus to every action
  composite. `component:Toolbar` FR4 and `component:ButtonGroup` FR8, FR9,
  its review checks, and its one-member-disabled state change from "arrows
  skip a disabled member" to "arrows visit it"; their tests that assert the
  skip are pending conformance.
- Consumers who select disabled controls with `:disabled`, query them with
  `toBeDisabled()`, or rely on disabled controls being skipped by Tab see a
  change. Release notes name it.

## Verification

| Contract | Verification                                                | Representative states                                                                                                     | Mutation or failure expectation                                                                                               |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Shared test over every component's disabled story           | Button, text field, checkbox, switch, selector, slider, group-disabled                                                    | Any rendered `disabled` attribute, or a changed tab order, fails                                                              |
| FR2      | Per-component keyboard, pointer, paste, and drop tests      | Each change path the component supports                                                                                   | A value change, activation, navigation, or callback fails                                                                     |
| FR3      | Form submission tests reading `FormData`                    | Disabled text, checkbox, selector, required-and-disabled field                                                            | A submitted disabled value, or a blocked submit, fails                                                                        |
| FR4      | Real-browser focus-transition checks                        | Last Pagination page, Calendar max month, last Lightbox item, group off                                                   | Focus on the document body fails                                                                                              |
| FR5      | Accessibility-tree checks                                   | Focused disabled control with and without a disabled reason                                                               | Missing disabled state, name, or reason fails                                                                                 |
| FR6      | Real-browser computed-style checks                          | Disabled at rest, hover, pressed, keyboard focus                                                                          | Hover or pressed paint, or a missing focus indicator, fails                                                                   |
| FR8      | Keyboard tests plus a real-browser accessibility-tree check | Toolbar and ButtonGroup with one disabled member, with and without a reason; a wholly disabled group; a menu row (DEC-11) | An arrow that skips a disabled member, a disabled member that activates, or a Tab stop that starts on a disabled member fails |

## Decision log

### DEC-1 — Disabled controls are focusable; native `disabled` is not used

**Reference:** `spec:AST-085/DEC-1`
**Decider:** cixzhang, 2026-10-21

Native `disabled` removes a control from focus. Keyboard users then cannot find
it, cannot read why it is unavailable, and lose their place when the control
they are on becomes disabled. One focusable shape for every disabled control
removes all three failures, and components keep the same `isDisabled` API.

Rejected: moving focus to a component-chosen fallback when a control becomes
disabled — every component needs its own destination, and focus still jumps.

### DEC-2 — Action composites reach a disabled member

**Decider:** pending

A keyboard user moving through a toolbar or a button group cannot learn that a
disabled button exists, or why, when arrow keys skip it. Menus already reach a
disabled row (`component:DropdownMenu` DEC-11). FR8 gives every action
composite the same rule. Composites whose arrows select or pick a value keep
skipping, because landing on a disabled member there would seem to select
nothing.

Rejected: reaching disabled members in every composite, including radio
groups, segmented controls, and calendars, where an arrow that lands without
selecting breaks the selection-follows-focus pattern. Rejected: keeping each
composite's own skip rule, which leaves a toolbar's disabled reason reachable
only by pointer hover.

## Open questions

None.
