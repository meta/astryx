---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-079
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-14
phase: accepted
owners: [cixzhang]
affects_architecture:
  [architecture:public-component-api, architecture:component-theming-surface]
affects_families: [family:input-fields]
affects_contributing: []
affects_consumer_docs: [Selector, MultiSelector, ComplexSelector]
---

# Shared selector trigger hierarchy system spec

## Intent

A builder can place `Selector`, `MultiSelector`, or `ComplexSelector` beside
controls in a toolbar or navigation area without making one selector look like a
form field while another uses a different hierarchy. `Selector` defines the
`input`, `secondary`, and `ghost` trigger vocabulary in its current component
contract. `MultiSelector` and `ComplexSelector` adopt the same values and roles,
so all three built-in selector triggers communicate one caller choice while
keeping their own value and popup behavior.

## Ownership boundary

`component:Selector` owns Selector's closed trigger values and DD1's durable
relationship between its `secondary` trigger and adjacent secondary Buttons.
This record owns adoption of that vocabulary by `MultiSelector` and
`ComplexSelector`, plus the cross-component requirement that all three expose the
same value names, defaults, and resting roles. Their component records keep each
selector's selection, popup, and anatomy contracts.

The released `Button` component owns its own variant map and secondary treatment;
this record does not define Button behavior. It requires the `secondary` trigger
of every built-in selector to match that treatment in the active theme.
`family:input-fields` owns the layout, status, and InputGroup rules projected by
FR5 and FR6, but it does not add this visual axis to every input-family member. General control hierarchy, exact token
selection, and component geometry remain outside this record.

## Non-goals

- Adding the trigger variants to another input-family member.
- Replacing or weakening `component:Selector/DD1`.
- Changing selection, search, popup, focus, keyboard, form, or accessibility
  behavior.
- Requiring identical geometry or state-by-state pixels across the three selector
  components or between a selector and Button.
- Prescribing exact theme tokens beyond the default resting roles in FR2.
- Styling a caller-rendered trigger. A control supplied through `renderTrigger`
  remains caller-owned under `spec:AST-055`.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Public concepts

| Concept                  | Closed values                     | Meaning                                                                          | Default | Owner                                                     | Stability                         |
| ------------------------ | --------------------------------- | -------------------------------------------------------------------------------- | ------- | --------------------------------------------------------- | --------------------------------- |
| built-in trigger variant | `input`, `secondary`, and `ghost` | Selects form-field, secondary-Button, or transparent low-emphasis trigger chrome | `input` | Selector meaning: `component:Selector`; adoption: AST-079 | `secondary` additive; others kept |

## Requirements

- **FR1 — Every selector trigger exposes the same closed vocabulary.** `Selector`
  keeps the current `input`, `secondary`, and `ghost` values owned by its
  component contract. `MultiSelector` and `ComplexSelector` MUST accept the same
  three values for the built-in trigger's `variant`. Every public type, rendered
  `data-variant` reflection, consumer theming declaration of the `variant`
  visual-prop axis, and consumer document that exposes this axis MUST use those
  same names. Other values are rejected by the public type.
- **FR2 — The resting roles are shared.** At rest, `input` presents an opaque,
  bordered form-field surface; `secondary` matches the active theme's secondary
  `Button`; and `ghost` presents a transparent, lower-emphasis trigger. For
  `secondary` on all three selectors, the resting border (width, style, and
  color), fill, and text color MUST match those of a secondary `Button` in the
  same theme, in parity with `component:Selector/DD1`; under the default theme
  that is a borderless, neutral-filled, medium-emphasis trigger. The three
  treatments MUST remain distinguishable at rest. `component:Selector/DD1`
  additionally owns Selector's parity with an adjacent secondary Button through
  its states. MultiSelector and ComplexSelector MAY reuse their existing shared
  non-input hover, active, focus-visible, disabled, and read-only treatments;
  this record does not require their state pixels to be identical to Selector or
  Button. A theme MAY choose exact tokens while preserving the resting roles. The
  Button component retains ownership of its own secondary treatment.
- **FR3 — Trigger paint does not change selector behavior.** Changing `variant`
  MUST NOT change the selected value, option or child vocabulary, popup
  presentation mode (`popover`, `bottom-sheet`, or `adaptive`) or overlay
  semantics, keyboard model, focus ownership, form participation, accessible
  name, role, or value semantics. Visual alignment MAY follow the chosen trigger
  surface.
- **FR4 — Adoption is compatible.** `input` remains the default for all three
  components. Existing `input` and `ghost` callers keep their released behavior.
  A MultiSelector or ComplexSelector caller opts into `secondary` explicitly; no
  migration is required for an existing callsite. Selector compatibility remains
  owned by its current component contract.
- **FR5 — Family width and status rules still govern.** Under
  `family:input-fields` FR1, standalone `Selector` MAY follow its displayed
  content while `MultiSelector` and `ComplexSelector` MUST keep their available
  inline size across value changes. Under family FR8, a requested `attached`
  status on a non-input (`secondary` or `ghost`) trigger resolves to
  `detached`; status border and shadow remain limited to an eligible `input`
  trigger.
- **FR6 — InputGroup keeps the connected surface.** `Selector` and
  `MultiSelector` MAY use `secondary` inside InputGroup. The trigger MAY keep its
  neutral local fill, but it MUST adopt the group's resolved height, connected
  edge radii, and focus stacking and MUST NOT paint a standalone outer border,
  shadow, or status treatment. InputGroup remains the owner of the connected
  outer geometry under `family:input-fields` FR3. `ComplexSelector` has no
  InputGroup support.

### Platform support

- Supported feature/engine floor: every browser and renderer already supported
  by the three components; the vocabulary adds no platform feature.
- Unsupported behavior: none. A theme that changes exact paint still preserves
  FR2's resting hierarchy and FR3's behavior.
- Browser evidence: real-browser resting pixels beside secondary Buttons and
  before/after inline-size measurements for value changes in MultiSelector and
  ComplexSelector. Source inspection covers shared non-input state branches.
  FR2 is proven by rendered comparison of each selector's resting `secondary`
  trigger with a secondary `Button` in the default theme and in every shipped
  theme that styles the secondary `Button`. Conformance to FR6 requires focused
  DOM/style tests and rendered group geometry for secondary Selector and
  MultiSelector.

## Current-state impact

- The current Selector contract and DD1 remain the authority for Selector's
  values and local parity decision.
- The draft MultiSelector and ComplexSelector component records cite
  `spec:AST-079/DEC-1` for sibling adoption without making their unrelated claims
  current.
- MultiSelector and ComplexSelector consumer docs expose the shared three-value
  vocabulary and explain when to choose each value; Selector keeps its current
  documentation.
- `family:input-fields` continues to own inline size, status placement, and
  InputGroup surface rules; this record projects those rules onto the adopted
  trigger value without changing them.
- The Button component retains its released variant map and rendering.
- `architecture:public-component-api` continues to own additive API admission,
  defaults, and compatibility. `architecture:component-theming-surface`
  continues to own target and visual-prop propagation.

## Verification

| Contract | Verification                                                                                                                 | Representative states                                                                 | Mutation or failure expectation                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR4 | Public type, default-prop, `data-variant`, theme-metadata, and docs checks                                                   | all three components; omitted value; each explicit value                              | A component omits a value, changes its default, publishes a different value, or accepts an untyped value                   |
| FR2      | Resting browser pixels beside a secondary Button, and focused DOM/style tests                                                | each variant at rest; default theme and every theme that styles the secondary Button  | Secondary's border, fill, or text differs from the theme's secondary Button, ghost gains an opaque fill, or roles collapse |
| FR3      | Source review of variant-specific branches plus existing interaction, form, popup, keyboard, focus, and accessibility suites | popover, bottom sheet, adaptive; editable, disabled, and read-only where supported    | A visual variant changes selection or overlay semantics, form output, focus, naming, role, or value                        |
| FR5      | Focused status tests and browser width measurements                                                                          | attached request on each variant; short/long MultiSelector and ComplexSelector values | Non-input status attaches, input-only status paint leaks, or a multi-value/rich selector changes available inline size     |
| FR6      | Focused InputGroup DOM/style tests plus rendered group geometry                                                              | secondary Selector and MultiSelector as first, middle, and last group children        | A trigger keeps standalone edges/status paint, loses group height/focus stacking, or the connected surface splits          |

## Decision log

### DEC-1 — MultiSelector and ComplexSelector adopt Selector's trigger hierarchy

**Reference:** `spec:AST-079/DEC-1`
**Decider:** `cixzhang`, 2026-10-14

Selector's current component contract already gives a caller three trigger roles.
A caller choosing the same role on a multi-value or rich-content selector should
not learn different names or receive a different default. MultiSelector and
ComplexSelector therefore adopt Selector's `input`, `secondary`, and `ghost`
vocabulary while keeping their separate interaction models and component-owned
geometry. Their `secondary` matches the theme's secondary Button, as Selector's
does under DD1, so one theme decision restyles every secondary control together.

Rejected: sibling-specific value names or partial vocabularies, which make the
same caller intent depend on selection model; a theme-only override, which cannot
express caller intent through the public API; a fixed borderless neutral fill
independent of the theme's secondary Button, which splits one toolbar into two
hierarchies under any theme that borders its secondary Button; or promoting the
draft sibling component records wholesale, which would approve unrelated claims.

## Open questions

None.
