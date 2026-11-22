---
schema_version: 3
template_version: 7
kind: component
id: component:Item
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-16
owners: [cixzhang]
review_triggers: [public-api, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Item/Item.test.tsx,
    packages/core/src/Item/__tests__/ItemControlProps.a11y.chromium.spec.ts,
    packages/core/src/hooks/nestedTouchPress.adopters.test.tsx,
    packages/core/src/List/List.test.tsx,
    packages/core/src/RadioList/RadioList.test.tsx,
    packages/core/src/CheckboxList/CheckboxList.test.tsx,
    apps/storybook/stories/Item.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:public-component-api,
    architecture:internationalization,
  ]
contributing: [contributing:api-conventions]
system_specs: [spec:AST-017/FR3, spec:AST-057]
---

# Item component contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

This record governs how Item aligns its start and end content against the
label, and which element of the row is its control and how a caller's
`controlProps` reach it. Item's swipe actions are governed by `spec:AST-057`,
and its link and navigation semantics by `family:navigation-destinations`;
other Item behavior remains described by its source, tests, and `Item.doc.mjs`
until a record claims it.

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `align?: 'center' \| 'start' \| 'first-line'` on Item, ListItem, RadioListItem, and CheckboxListItem; default `center`. `controlProps?: ItemControlProps` on Item and ListItem: attributes for the control the row renders.                                                                                                                                                                                                                                                                                                 |
| Behavior                | `first-line` centers each start and end slot on the label's first line, for any slot height; a slot taller than that line moves the text down rather than leaving the row. `controlProps` reach the one element the row renders as its control; the row's own attributes win where they meet; a row that renders no control ignores them and warns in development.                                                                                                                                                          |
| End-user impact         | A small status dot, radio, or age stays level with the first line of a wrapped label instead of drifting to the middle of the row (`center`) or riding above the line (`start`).                                                                                                                                                                                                                                                                                                                                            |
| Builder impact          | None by default. A builder opts in per row with `align="first-line"`; theme authors may style the `item` target's `first-line` alignment.                                                                                                                                                                                                                                                                                                                                                                                   |
| Compatibility/readiness | Additive: a new value on an existing closed axis and typed forwarding of an existing runtime pass-through. Rows that omit `align` are unchanged. FR9 gap: outside a RadioList row, a mouse or pen press that starts on a nested control still paints the row.                                                                                                                                                                                                                                                               |
| Review checks           | Reject a changed default, changed `center`/`start` geometry, JavaScript measurement, a slot pushed outside the row, a second theme target, or a composing row that drops the value. Reject a state attribute forwarded from the root by name, a caller `role`, `onClick`, class, style, `hidden`, `inert`, `aria-hidden` or `aria-disabled` on the control, a disabled row given `controlProps` that drops `aria-disabled` or activates, a second element carrying the bag, or a row without the bag rendering differently. |
| Governing rules         | FR1–FR15 below; `architecture:component-theming-surface/INV6`; `architecture:public-component-api/INV4–INV5`; `spec:AST-017/FR3`; `spec:AST-085/FR1–FR2`.                                                                                                                                                                                                                                                                                                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

Item is the shared row behind lists, menus, pickers, and option rows. Its label
can wrap, while its start and end content is often a single-line-sized mark: a
status dot, a radio or checkbox, an icon, a short timestamp. Those marks belong
to the first line of text they annotate. Item owns the alignment because only
Item knows where its label's first line sits; a caller cannot place a slot
against it without copying Item's typography.

Item also renders its own interaction: the invisible anchor for `href`, the
invisible button for `onClick`, or its root when `as` is a link component. A
caller's other props land on the root around that element, so the row owns
which element is the control, and `controlProps` is the one door to it: the
states, relations, names, marks and key handling a caller must put on the
focused element rather than on the row.

## Compatibility and migration

- Released default preserved: `yes`; omitted `align` resolves to `center`.
- Compatibility class: additive closed-axis value; additive typed prop on three
  composing rows that already forward unknown props to Item at runtime.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: `component:Item/DEC-1`; `controlProps` is additive and
  omitting it changes nothing (`component:Item/DEC-3`).

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `align` axis: its values, default, and the geometry of each value for
  the start and end content slots.
- Reflecting the resolved alignment on the `item` theme target.
- Reflecting highlighted, selected, and disabled state on the `item` theme target.
- The forwarding rule for rows that compose Item and expose `align`.
- Which element of the row is the control, that `controlProps` add no tab
  stop to the row, the control's own attributes (the button's `type`, click
  and disabled state; the anchor's `href`, `target` and `rel`; a disabled
  row's `aria-disabled` and blocked activation), and the composition order of
  a caller's `controlProps` with them.

**Does not own / non-goals**

- The `marker` slot's alignment — owned by whoever renders the marker; ListItem
  positions its own markers against the first line.
- Typography of caller content inside `label` — owned by the caller.
- A theme-wide default alignment — themes style values; they do not choose a
  component's prop default (`architecture:component-theming-surface`).
- Alignment inside a slot's own content (for example, an avatar stack) — owned
  by that content.
- The parent composite's keyboard model (which row holds the roving `tabIndex`,
  what the arrow keys do) — owned by the composite, expressed through
  `controlProps`.
- A nested control's attributes under `interactiveRef` — owned by that control.

## Public concepts

| Concept       | Closed values or states                                                                                                                                                                 | Meaning                                                                                                                                              | Availability by variant/orientation/state                                                             | Default  | Owner            | Stability | Invalid-value behavior                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- | ---------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| Alignment     | `center`, `start`, `first-line`                                                                                                                                                         | `center`: slots centered on the whole text block. `start`: slot tops on the text block's top. `first-line`: slot centers on the first line's center. | Every density, layout, interaction mode, and direction; start and end slots                           | `center` | `component:Item` | stable    | Other values are rejected by the public type                                                               |
| Control props | `ItemControlProps`: HTML attributes less `role`, `onClick`, `className`, `style`, `children`, `dangerouslySetInnerHTML`, `hidden`, `inert`, `aria-hidden` and `aria-disabled`; `data-*` | Attributes for the element the row renders as its control                                                                                            | A row with `href` or `onClick` and no parent `role`; a row whose root is a link component, any `role` | omitted  | `component:Item` | stable    | The excluded keys are rejected by the type; a row with no control ignores the bag and warns in development |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                                                                                                                                                                                                                                           | Draft review state          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| FR1  | Item MUST accept `align` with exactly `center`, `start`, and `first-line`, and MUST resolve an omitted value to `center`. The geometry of `center` and `start` MUST NOT change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `component:Item/DEC-1`                                                                                                                                                                                                                          | settled                     |
| FR2  | Under `first-line`, the block-axis center of each rendered start-content and end-content slot MUST coincide with the block-axis center of the label's first line box, for every slot block size.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner direction                                                                                                                                                                                                                                 | settled                     |
| FR3  | Under `first-line`, a slot taller than the label's first line MUST stay inside the row's content box: the label and description move down by the difference, and the row grows to fit. No slot is clipped or painted into the row's block padding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Owner direction                                                                                                                                                                                                                                 | settled                     |
| FR4  | A row whose label renders a single line and which has no description MUST render identically under `first-line` and `center`, for every slot block size.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Follows from FR2 and FR3                                                                                                                                                                                                                        | settled                     |
| FR5  | The first line box is the label line as Item styles it, from the active theme's body text size and leading. A theme that changes those tokens moves the alignment with them. Caller content inside `label` that sets its own font size or line height is outside the FR2 guarantee.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Shared typography source                                                                                                                                                                                                                        | settled                     |
| FR6  | `first-line` MUST hold in every density, in `stacked` and `inline` layouts, with `labelLines` truncation, and in plain, button, link, link-root, delegated, and parent-role rows. In right-to-left text it MUST produce the same block-axis placement with the slots mirrored by logical order and no DOM reordering.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `architecture:internationalization`                                                                                                                                                                                                             | settled                     |
| FR7  | The `item` theme target MUST reflect the resolved alignment as its existing `align` selector axis, including `first-line`, and Item's public theming metadata MUST list that value. The alignment axis adds no new target or theme-level default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `architecture:component-theming-surface/INV6`; `component:Item/DEC-2`                                                                                                                                                                           | settled                     |
| FR8  | ListItem, RadioListItem, and CheckboxListItem MUST expose `align` with Item's values and default and forward it unchanged to the Item row they render. A composing row MUST NOT drop, remap, or narrow the value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Owner direction                                                                                                                                                                                                                                 | settled                     |
| FR9  | An interactive row (an `onClick` row, an `href` row, or a delegated row with `interactiveRef`) shows its pressed paint only for a press that would activate it, from any pointer: a press on the row's surface or on its own action (its invisible button or link, or the control it delegates to) paints the row, and a press that starts on another interactive element inside the row paints none (`architecture:press-feedback` INV7). In a row with a parent-supplied `role`, or a row whose root is a link, a press on a nested control activates the row, so it paints. The same rule decides activation for an `onClick` or `href` row with no parent-supplied `role` and no link root: a click on another interactive element inside the row, native or role-based, or in content the caller portals out of the row, does not run the row's `onClick` or follow its link. | Owner direction, 2026-11-03: no pressed state on a container for a press that does not activate it; owner decision, 2026-11-11: a mouse and a pen too, on a row that owns a control's box; owner decision, 2026-11-16: every pointer, every row | settled                     |
| FR10 | The `item` theme target MUST reflect a highlighted, selected, or disabled row as `data-highlighted`, `data-selected`, and `data-disabled`, each present only while its state holds, with the names CommandPaletteItem uses. A row that composes Item reflects the states it passes to Item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `architecture:component-theming-surface/INV6`; shipped source and focused tests, not owner-reviewed                                                                                                                                             | settled; not owner-reviewed |
| FR11 | The row MUST render at most one control of its own: the invisible anchor when `href` is set, else the invisible button when `onClick` is set, or the root itself when `as` is a link component and `href` is set, in which case an invisible button the row also renders for `onClick` is nested inside that root as a second tab stop, and is not the control. A row with a `role` on a plain root, or with an `interactiveRef`, renders none.                                                                                                                                                                                                                                                                                                                                                                                                                                    | current behavior; `architecture:public-component-api/INV5`                                                                                                                                                                                      | settled                     |
| FR12 | `controlProps` MUST be spread on that control and nowhere else: on a link root, the root alone. Where the row renders no control they MUST be ignored, and a development warning MUST name where the attributes belong.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `component:Item/DEC-3`                                                                                                                                                                                                                          | settled                     |
| FR13 | The row's own attributes MUST win where they meet `controlProps`, on every control: `aria-disabled` is the row's own, `true` while the row is disabled and absent otherwise; a disabled row's button, anchor or link root does not activate whatever the bag says, and keeps the enabled row's focus order, or the bag's `tabIndex` where the bag sets one; the button's `type`, `onClick` and disabled state, and the anchor's `href`, `target` and `rel`, are never a caller's. On a link root `controlProps` are written after the root's props, so on an attribute named in both the `controlProps` value is the one written.                                                                                                                                                                                                                                                  | `component:Item/DEC-4`; `spec:AST-085/FR1–FR2`                                                                                                                                                                                                  | settled                     |
| FR14 | A row given no `controlProps`, whatever its control, MUST render exactly what it renders without the prop existing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `component:Item/DEC-3`                                                                                                                                                                                                                          | settled                     |
| FR15 | `ItemControlProps` MUST exclude the control's own `role`, `onClick`, `className`, `style`, `children`, `dangerouslySetInnerHTML` and `aria-disabled` (the row's disabled state is its own), and `hidden`, `inert` and `aria-hidden` (the row's only focusable element is never hidden by the bag), and MUST accept `data-*`, the other `aria-*`, `tabIndex`, `id` and event handlers. ListItem MUST expose it and forward it unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                            | `component:Item/DEC-3`                                                                                                                                                                                                                          | settled                     |

### Allowed variation

- **AV1 — Slot content.** Any slot content and size may appear; FR2 holds for
  each slot independently, so a start slot and an end slot of different heights
  each center on the first line.
- **AV2 — Theme typography.** Body text size and leading may vary by theme; the
  first line box follows them (FR5).
- **AV3 — Row height.** Under `first-line` a row may be taller than the same
  row under `center` when a slot is taller than the first line and a
  description or second label line is present (FR3).
- **AV4 — Which attributes a caller sends.** States (`aria-expanded`,
  `aria-haspopup`, `aria-pressed`), relations (`aria-controls`,
  `aria-describedby`), a name (`aria-label`, `aria-labelledby`), marks
  (`data-*`), key handling (`onKeyDown`) and a composite's `tabIndex` may all
  vary; the row does not interpret them.
- **AV5 — Which control the row renders.** An anchor, a button or a link root
  may each be the target without the caller changing the bag.

### Representative states

| State                                         | Required invariant                                                                                                                               | Allowed variation                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Wrapped label, 6px dot start, short-text end  | Both slot centers on the first line's center.                                                                                                    | Density, theme typography, direction.             |
| One-line label, no description, any slot      | Identical to `center`.                                                                                                                           | Slot size.                                        |
| Label and description, 40px avatar start      | Avatar center on the first line's center; text moves down; row grows.                                                                            | Avatar size.                                      |
| Radio or checkbox row with a wrapped label    | The control centers on the first line.                                                                                                           | Control size by Field size.                       |
| Right-to-left                                 | Same block-axis placement; slots mirrored by logical order.                                                                                      | Writing direction.                                |
| Omitted `align`                               | Identical to today's `center`.                                                                                                                   | None.                                             |
| `onClick` or `href` row, `controlProps` given | The attributes sit on the invisible button or anchor; the root carries none of them.                                                             | Any accepted attribute.                           |
| Disabled row, `controlProps` given            | `aria-disabled="true"` on the control and no activation, whatever the bag says; it keeps the enabled row's focus order, or the bag's `tabIndex`. | Button, anchor or link root.                      |
| Link root (`as`), `controlProps` given        | The attributes sit on the root, after the root's props; a button beside it for `onClick` carries none; nothing warns.                            | Any `role` the parent gives the row.              |
| Any row, no `controlProps`                    | Every element renders as if the prop did not exist.                                                                                              | Button, anchor or link root; enabled or disabled. |
| `role` on a plain root; `interactiveRef`      | The bag is ignored and a development warning names the right element.                                                                            | Any role; any nested control; a link root too.    |

### Transformation and precedence order

- **ORD1 — Resolution.** An explicit `align` on a composing row forwards to
  Item unchanged; Item resolves an omitted value to `center`; the resolved value
  drives both geometry and the `item` target's selector axis, so the two never
  disagree.
- **ORD2 — The control.** Resolve the control per FR11 before any attribute is
  placed.
- **ORD3 — Composition on the control.** Write, in order: the root's props (a
  link root only), then `controlProps`, then the row's own attributes (FR13),
  so the later write wins on a shared attribute. With no bag the second step
  is absent, and the first and third are all the row writes.

### Performance and resources

- **PR1 — CSS geometry only.** Every alignment value MUST be achieved in CSS:
  no measurement, observer, listener, state, Effect, or extra render pass.
- **PR2 — No runtime beyond the spread.** `controlProps` adds no state,
  listener, observer or render pass; the row spreads the object it is given.
  The development warning for a row that renders no control shares Item's
  existing dev-warning hook, which carries one ref and one Effect per row in
  every build and is the only Effect this contract touches.

## Accessibility contract

- **AR1 — Presentation only.** Alignment MUST NOT change the DOM order, role,
  accessible name or description, focus target, tab order, or hit target of the
  row or its slots.
- **AR2 — No exposed text.** Any construct that implements `first-line` MUST
  contribute no text to the accessibility tree.
- **AR3 — One tab stop.** `controlProps` never adds a focusable element to the
  row; it attributes the one the row already renders.
- **AR4 — State rides the focused element.** A state or relation a caller puts
  in `controlProps` is reported by the accessibility tree on the node that
  takes focus, not on a generic ancestor.
- **AR5 — A disabled row given `controlProps` is not operable.** Its control
  says `aria-disabled` and does not activate, whatever the bag asked, and keeps
  the enabled row's focus order, or the bag's `tabIndex` (`spec:AST-085` FR1,
  FR2). A disabled row
  given no bag renders as if the prop did not exist (FR14).

## Design relationships

| Anatomy or state      | Design requirement                                             | Representation authority | Hierarchy role | Component contract |
| --------------------- | -------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Start and end content | Annotates the first line of the label it sits beside.          | Owner direction          | Supporting     | FR2–FR4            |
| Label first line      | The reference line the slots align to.                         | Item typography          | Prominent      | FR5                |
| Label                 | The control the label sits in carries the caller's attributes. | prescribed               | Prominent      | FR11–FR12          |

## Family and system relationships

- `spec:AST-057` owns Item's swipe actions and their panels; alignment does
  not change them, because the panels sit outside the row's flow, and
  `controlProps` neither reach a panel nor change swipe availability.
- `family:navigation-destinations` owns Item's link and navigation semantics;
  alignment does not change them.
- `architecture:component-theming-surface` owns how visual axes reach theme
  targets; this record adds one value to Item's existing `align` axis.
- `architecture:public-component-api` owns prop admission; FR8 types an existing
  runtime pass-through rather than adding a parallel concept, and INV4 and INV5
  admit `controlProps` (a caller-owned intent the row cannot derive; accepted
  inputs reach the element that owns the contract, and component-owned
  accessibility is not overwritten).
- `component:List` passes the row's props through `ListItem` unchanged;
  `ListItem` declares `controlProps` beside `swipeActions` and `swipeBehavior`
  and forwards it as is.
- `architecture:internationalization` owns logical-direction behavior; FR6
  applies it.
- `spec:AST-017/FR3` classifies this as a non-breaking feature: it adds a value
  and a typed prop, narrows nothing, and a caller who never sets `align` sees no
  change.

## Verification map

| Contract       | Verification                                                                                                                                                                                                                                                                | Representative states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Audit section         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| FR1, FR7       | `Item.test.tsx` alignment and theme-reflection suites; public type test                                                                                                                                                                                                     | Omitted, `center`, `start`, `first-line`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A changed default, a missing `data-align="first-line"`, or a widened type fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `audit:Item/api`      |
| FR2–FR6        | Real-Chromium geometry assertions over the Item alignment stories                                                                                                                                                                                                           | Wrapped label with dot and age; avatar; densities; RTL; theme                                                                                                                                                                                                                                                                                                                                                                                                                                                           | A slot center off the first line center by more than 0.5px, or a clipped slot, fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `audit:Item/layout`   |
| FR8            | `List.test.tsx`, `RadioList.test.tsx`, `CheckboxList.test.tsx` forwarding cases                                                                                                                                                                                             | Each composing row with `align="first-line"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | A row whose Item root lacks `data-align="first-line"` fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `audit:Item/api`      |
| FR9            | `nestedTouchPress.adopters.test.tsx`; `Item.nestedPress.test.tsx`; the nested-control cases in `CheckboxList.test.tsx`, `RadioList.test.tsx` and `useClickableContainer.test.tsx`; `Item.test.tsx` "clicks that belong to something else" and the List link-row portal case | A finger on the delegated control; a finger on another control in the row; a mouse and a pen on another control in a CheckboxList or RadioList row; a click on a role-based control or in portaled content                                                                                                                                                                                                                                                                                                              | A row painted for a press on another control, or not painted for a press on its delegated control, or an `onClick` or `href` row with no parent-supplied `role` and no link root that runs its `onClick` or follows its link for a click on another control or in portaled content, fails. Gap: no test yet covers a mouse or pen press on another control in an `onClick`, `href` or delegated row outside CheckboxList and RadioList, or a press on a nested control in a link-root or role row; the `useClickableContainer.test.tsx` mouse-and-pen case asserts the earlier rule. | `audit:Item/behavior` |
| FR10           | `Item.test.tsx` "reflects highlighted, selected, and disabled on the item theme target"                                                                                                                                                                                     | Plain, highlighted only, selected only, disabled only, and all three together                                                                                                                                                                                                                                                                                                                                                                                                                                           | A missing attribute, or an attribute left on a row whose state does not hold, fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `audit:Item/theming`  |
| AR1, AR2       | Accessibility-tree snapshot of a `first-line` row against a `center` row                                                                                                                                                                                                    | Plain and option rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Any difference in name, role, description, or order fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `audit:Item/a11y`     |
| PR1            | Source review of Item's alignment styles                                                                                                                                                                                                                                    | All values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | A ref, observer, or Effect added for alignment fails review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `audit:Item/layout`   |
| FR11–FR15, AR5 | `Item.test.tsx` `controlProps` suite; `List.test.tsx` forwarding case                                                                                                                                                                                                       | button; anchor with `href`/`target`/`rel`; a name of the control's own; a disabled button, anchor and link root, each with the bag's `onKeyDown`; a disabled link root whose bag sets no `tabIndex`, alone and with the root's `tabIndex={-1}`; a link root with and without the bag; a link root with `onClick` (one element carries the bag); a disabled button without the bag; an untyped bag's `aria-disabled` on an enabled button, anchor and link root; the no-control cases, a delegating link root among them | Spreading the bag on the root, dropping the disabled precedence on any control, changing a bag-less row, a bag's `aria-disabled` reaching a control, or warning on a link root fails                                                                                                                                                                                                                                                                                                                                                                                                 | `audit:Item/control`  |
| AR3–AR4        | `ItemControlProps.a11y.chromium.spec.ts` (real Chromium, axe)                                                                                                                                                                                                               | A disclosure row closed and open, Tab then Enter                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The focused node not reporting the state, the root reporting it, or an axe violation in either state fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `audit:Item/a11y`     |

## Decision log

<!-- Record the boundary or requirement, not how it was reached. A rejected alternative is at most one line here, kept only when it is consequential and likely to recur. -->

### DEC-1 — `first-line` is an opt-in value; `center` stays the default

**Reference:** `component:Item/DEC-1`
**Decider:** cixzhang, 2026-10-16

A wrapped label with a single-line-sized mark needs the mark on its first line,
and neither existing value does that: `center` drops the mark to the middle of
the row and `start` pins its top, which leaves a small mark above the line's
center. A new value fixes those rows without moving any row that relies on
today's default.

Rejected: making `first-line` the default, because a slot sized to the whole
text block, such as an avatar beside a label and description, is correct under
`center`.

### DEC-2 — The theme setting is the `item` target's alignment axis

**Reference:** `component:Item/DEC-2`
**Decider:** cixzhang, 2026-10-16

Themes reach `first-line` rows through the `item` target's existing `align`
selector axis, the same way they reach `center` and `start`. A theme can style
those rows; it does not choose which value a row receives.

### DEC-3 — `controlProps` is an explicit object, not a forwarding rule

**Reference:** `component:Item/DEC-3`
**Decider:** vjeux, 2026-10-20

The row cannot tell a root attribute from a control attribute by name: a
caller may put `aria-expanded` or a `data-*` mark on the row on purpose, and
`onKeyDown` means a different thing on each element. An object the caller fills
names the control explicitly, accepts the attributes the control's element
accepts, excludes what the row owns on it (`role`, `onClick`, class, style,
children, `aria-disabled`) and what would hide the row's only focusable
element (`hidden`, `inert`, `aria-hidden`), and lands on one element. A row
given no bag renders as if the prop did not exist.

Rejected: forwarding a fixed list of ARIA state attributes from the root, because
it moves attributes some callers place on the root deliberately and cannot grow
to marks or handlers.

### DEC-4 — The row's own attributes win where the bags meet

**Reference:** `component:Item/DEC-4`
**Decider:** vjeux, 2026-10-20

The row's disabled state is its own. A bag's `aria-disabled` would announce
a state the row does not have: `spec:AST-085` exposes `aria-disabled` on a
disabled control (FR1) and on a busy one (FR6), never on a plain enabled one.
A disabled row whose activation a caller could restore would contradict its
own state (FR2). It keeps the enabled row's focus order, or the bag's `tabIndex`
(FR1). The button's `type` and click and the anchor's address are likewise the
row's. So the row writes those last, on every control. Where the control is the
root, the root's props are written first and `controlProps` after them: the bag
names the control explicitly and is the more specific of the caller's two
inputs.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
