---
schema_version: 3
template_version: 7
kind: component
id: component:Token
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Token/Token.test.tsx,
    packages/core/src/Token/__tests__/TokenRemoveTarget.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/theme/extensibleAxes.test.ts,
    apps/storybook/stories/Token.stories.tsx,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-005, spec:AST-009, spec:AST-085]
---

# Token component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | An inline chip with a required string `label`, `size`, theme-extensible `color`, optional `icon` and `endContent`, and optional `onClick`, `href`, and `onRemove` interactions.                               |
| Behavior                | `href` renders a link, `onClick` (or an enclosing trigger context) renders a container whose inner button wraps the label, and `onRemove` adds a separate remove button beside, never inside, them.           |
| End-user impact         | Pointer users can activate the whole chip; keyboard and screen-reader users reach the chip's action and its remove action as separate, named controls.                                                        |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                                  |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Six implementation gaps are listed under Current-state impact.                                                                     |
| Review checks           | Reject a remove button nested in the link or the inner button, a remove target smaller than 24 by 24 CSS pixels, a native `disabled` attribute, or a token that navigates around the shared destination rule. |
| Governing rules         | `family:navigation-destinations`; `spec:AST-005`; `spec:AST-085/FR1,FR2,FR5`; `architecture:public-component-api/INV5,INV6,INV8`; `architecture:component-theming-surface/INV6,INV14`.                        |

This table is a review projection; the body below is authoritative.

## Intent

Token represents one discrete piece of associated data — a tag, a filter, a
selected recipient — as a compact inline chip. It owns the chip's geometry and
tones, the choice of a static, clickable, or link structure, and the remove
action beside the chip's own action.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable; Token holds no state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Disabled link token (FR5, AR5).** A disabled token with `href` and no
  `onClick` renders a static `span`: it loses its tab stop and exposes no
  disabled state, where `spec:AST-085` FR1 and FR5 keep a disabled control
  focusable and announced.
- **`onClick` with `href` (FR3).** When a token renders as a link, a supplied
  `onClick` is not attached or called, where
  `architecture:public-component-api` INV5 preserves accepted event inputs.
- **Hidden-label name on a generic container (AR3).** With `isLabelHidden`, a
  static, clickable, or link-and-remove token puts `aria-label` on a `span` that
  has no role, where WAI-ARIA 1.2 prohibits naming the generic role. The
  visually hidden label text still reaches assistive technology.
- **Disabled state not reflected on the target (FR5).** No structure reflects
  `isDisabled` on the `token` target, so a theme cannot style the disabled state
  through it, where `architecture:component-theming-surface` INV6 keeps state on
  the owning target.
- **Two focus indicators on Remove (AR4).** In clickable and link-and-remove
  tokens, keyboard focus on the Remove button draws the token's outline and the
  button's own, where `architecture:interaction-modality` INV3 allows one
  indicator per focus move.
- **Small remove target (AR6).** At `size="sm"` the token's 20px block size and
  clipped overflow cut the Remove button's hit area to 24 by 20 CSS pixels,
  below the 24 by 24 of WCAG 2.2 2.5.8.

## Ownership boundary

**Owns**

- The token root, its Icon and End content slots, the Label, and the Remove
  button.
- Size geometry, tones, label overflow, and the disabled treatment.
- Choosing the static, clickable, link, or link-and-remove structure, and the
  surface-click delegation in the clickable and link-and-remove structures.
- The Remove button's name, target size, and isolation from the token's own
  action.

**Does not own / non-goals**

- Navigation-destination safety and router substitution — owned by
  `family:navigation-destinations` and `spec:AST-005`; Token renders its link
  through the shared link component.
- Which enclosing contexts make a token a trigger — owned by the shared
  interactive-role context; Token only consumes the resolved role.
- Hover and press overlays and touch press timing — owned by the shared
  interaction overlay used by every pressable surface.
- The supplied icon's and end content's own semantics — owned by those nodes.
- Collections of tokens, token entry, and keyboard deletion — owned by
  `component:Tokenizer` and other composing components.

## Public concepts

| Concept          | Closed values or states                                                                                          | Meaning                                                        | Availability by variant/orientation/state                                       | Default   | Owner             | Stability | Invalid-value behavior                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- | ----------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure        | static; clickable; link; link-and-remove                                                                         | Which element owns the token's own action (FR2–FR4).           | Resolved from `href`, `onClick`, `isDisabled`, and an enclosing trigger context | static    | `component:Token` | Stable    | A disabled link token stays a focusable control that exposes its disabled state (FR5); today it resolves to the static structure, the FR5 gap. |
| Size             | `sm`, `md`, `lg`                                                                                                 | Selects the block size.                                        | All structures                                                                  | `md`      | `component:Token` | Stable    | TypeScript rejects other values.                                                                                                               |
| Tone (`color`)   | `default`, `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `blue`, `purple`, `pink`, `gray`; theme additions | Selects fill and text color.                                   | All structures                                                                  | `default` | `component:Token` | Stable    | A theme-added value is reflected on `token` and receives no component fill or color; TypeScript rejects unregistered values.                   |
| Removable        | present when `onRemove` is supplied; absent                                                                      | Adds the Remove button after the label and end content.        | All structures                                                                  | absent    | `component:Token` | Stable    | —                                                                                                                                              |
| Label visibility | visible; visually hidden                                                                                         | Hides the label visually while keeping it as the token's name. | All structures                                                                  | visible   | `component:Token` | Stable    | —                                                                                                                                              |
| Disabled         | enabled; disabled                                                                                                | Blocks every token and remove action.                          | All structures                                                                  | enabled   | `component:Token` | Stable    | —                                                                                                                                              |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1  | Content renders in logical inline order: Icon, Label, End content, Remove button. The root is inline-flex with `--spacing-1` gaps, inline padding `--spacing-2`, `--radius-inner` corners, `--text-supporting-size` type at `--font-weight-medium`, and block size `--size-element-sm`, `-md`, or `-lg` minus 8px for `sm`, `md`, and `lg`.                                                                                                                                                                                                                                                                                                                                                                      | Current source and tests |
| FR2  | With no `href`, `onClick`, or enclosing trigger context, the token is a static `span` holding its content directly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests |
| FR3  | With an enabled `href` and no `onRemove`, the token root is the shared link component carrying the destination; it takes the root ref, passthrough props, and its own focus-visible outline. A supplied `onClick`, as an accepted event input, reaches the element that owns the contract (`architecture:public-component-api` INV5). Implementation gap: in both link structures `onClick` is not attached or called (Current-state impact).                                                                                                                                                                                                                                                                    | Current source and tests |
| FR4  | With `onClick`, or an enclosing trigger context that resolves the token to a button, the root is a `span` container holding an inner `button` that wraps only the Label and calls `onClick`; a click on the container outside any nested button or link also calls `onClick`. With an enabled `href` and `onRemove`, the container instead holds an inner link wrapping only the Label; a plain click on the surface outside the Remove button follows that link, and a Cmd/Ctrl-click or middle click on the surface opens it in a new tab. A caller `onMouseUp` on the link-and-remove container runs before its delegation.                                                                                   | Current source and tests |
| FR5  | A disabled token renders at half opacity with pointer events off and fires neither `onClick` nor `onRemove` from pointer, Enter, or Space; inner and Remove buttons stay focusable with `aria-disabled="true"` and never receive native `disabled`. A disabled control keeps its tab stop and exposes its disabled state (`spec:AST-085` FR1, FR5), and the disabled state is reflected on the owning target (`architecture:component-theming-surface` INV6). Implementation gap: a disabled token with `href` and no `onClick` or trigger context renders as a static `span` with no tab stop and no disabled state, and no structure reflects the disabled state on the `token` target (Current-state impact). | Current source and tests |
| FR6  | `onRemove` renders a `type="button"` Remove button holding a close glyph; a click stops propagation before `onRemove` runs, so it never triggers the token's own action or link. The button is a sibling of the inner button or link, never nested in it.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and tests |
| FR7  | The label never wraps: the root is capped at its container's inline size and clips overflow. In the static and link structures the Label ends in an ellipsis; in the clickable and link-and-remove structures the inner control clips the Label without an ellipsis. `isLabelHidden` keeps the Label in the DOM with a visually hidden clip treatment.                                                                                                                                                                                                                                                                                                                                                           | Current source and tests |
| FR8  | `color` defaults to `default`, painting `--color-neutral` with primary text; every other built-in tone paints its tinted background with its matching colored text. The `token` target reflects the resolved `color` and `size` for every value, including a theme-added color, which receives no component fill or text color until a theme paints it.                                                                                                                                                                                                                                                                                                                                                          | Current source and tests |
| FR9  | Clickable and link structures paint the shared hover overlay under a hover-capable pointer and the shared pressed overlay for mouse and touch presses; the static structure paints neither.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source           |
| FR10 | `ref` reaches the root element of every structure. Supported DOM, ARIA, data, and event props reach the root; `data-testid` reaches the root; `xstyle`, `className`, and `style` merge in that order after component styles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests |

### Allowed variation

- **AV1 — Theme paint.** A theme may change visual properties of `token` per
  `color` and `size` without changing structure, slot order, or the Remove
  button's target.
- **AV2 — Router link.** A `LinkProvider` link component may replace the native
  anchor in the link structures under `family:navigation-destinations`.

### Representative states

| State              | Required invariant                                                                    | Allowed variation           |
| ------------------ | ------------------------------------------------------------------------------------- | --------------------------- |
| Static             | `span` root; Token adds no focusable element except a Remove button.                  | Tone, size, slots.          |
| Clickable          | One inner button named by the label; container click calls `onClick`.                 | End content.                |
| Link               | Root is the link; focus outline on the link itself.                                   | Router link component.      |
| Link and remove    | Container holds a link and a sibling Remove button; surface click activates the link. | Modified and middle clicks. |
| Removable          | Remove button named "Remove {label}" with a 24 by 24 CSS pixel target.                | Locale wording.             |
| Disabled clickable | Buttons focusable with `aria-disabled="true"`; no callback fires; half opacity.       | Tone.                       |
| Hidden label       | Label text visually hidden; the root's `aria-label` equals the label.                 | Structure.                  |

### Transformation and precedence order

- **ORD1 — Structure.** Enabled `href` → `onClick` → enclosing trigger context →
  static. `onRemove` with an enabled `href` selects the link-and-remove
  container. A disabled `href` is skipped, so a disabled link token falls
  through to `onClick`, a trigger context, or static; the static fall-through is
  the FR5 gap.
- **ORD2 — Root attributes.** Component class and `data-color`/`data-size` →
  component styles → `xstyle` → `className` → `style` → caller props → `data-testid`, hidden-label
  `aria-label`, and `aria-description`. A hidden label's `aria-label` replaces
  a caller `aria-label`.
- **ORD3 — Remove click.** Stop propagation → `onRemove`.

### Performance and resources

- **PR1 — Shared press controller.** Every structure installs the shared
  document-level press controller once per mount through its counted
  installer; Token adds no per-token listener, observer, or timer. Only the
  link-and-remove container holds refs for click delegation.

## Accessibility contract

- **AR1 — Separate controls.** The token's own action and the Remove button are
  separate focusable controls in DOM order; neither is nested in the other, so
  the HTML interactive-content rule holds.
- **AR2 — Names.** In the clickable and link-and-remove structures the inner
  button or link takes its name from the Label. In the link structure the link
  is the root and takes its name from all of its content, including End content
  (a label "Inbox" with a count reads "Inbox 12"). The
  Remove button is named by the translated "Remove {label}" string.
- **AR3 — Hidden label.** With `isLabelHidden`, the Label text stays in the
  accessibility tree and names the token, and no element with the generic role
  carries a name (WAI-ARIA 1.2). The root carries `aria-label` equal to the
  label. Implementation gap: on the static, clickable, and link-and-remove
  structures that root is a role-less `span`.
- **AR4 — One focus indicator per focus move.** Each focus move shows one
  owning indicator (`architecture:interaction-modality` INV3). The link root
  draws its own focus-visible outline; clickable and link-and-remove containers
  draw the outline for the inner control, which draws none of its own; the
  Remove button draws its own outline. Implementation gap: the containers draw
  their outline while any descendant has `:focus-visible`, so focusing Remove in
  those structures shows the container outline and the button's own.
- **AR5 — Disabled.** A disabled token's controls stay focusable, expose
  `aria-disabled="true"`, and ignore pointer, Enter, and Space (`spec:AST-085`
  FR1, FR2, FR5); the inner and Remove buttons do. Implementation gap: a
  disabled link token renders as a static `span` with no tab stop and no
  disabled state.
- **AR6 — Remove target size.** The Remove button's glyph box is 16 by 16 CSS
  pixels and its hit area extends 4 pixels on every side to 24 by 24 at `md`
  and `lg`, meeting WCAG 2.2 2.5.8, while a press on the adjacent label still
  runs the token's own action, in both text directions. Implementation gap: at
  `size="sm"` the 20px-tall root clips the extension, leaving a 24 by 20 target.
- **AR7 — Description.** `description` sets `aria-description` on the root.

## Design relationships

| Anatomy or state | Design requirement                                           | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Token root       | A compact chip whose tone identifies the data it represents. | Current source           | Prominent      | FR1, FR7, FR8      |
| Icon             | Optional leading glyph identifying the token type.           | Current source and docs  | Supporting     | FR1                |
| Label            | The visible text and the default accessible name.            | Current source and docs  | Prominent      | FR7, AR2, AR3      |
| End content      | Optional trailing content such as a count or status dot.     | Current source and docs  | Supporting     | FR1                |
| Remove button    | A trailing close control that dismisses the token.           | Current source and docs  | Supporting     | FR6, AR1, AR2, AR6 |

Theming: the root is the single `token` target and reflects `color` and `size`.
The Label, End content, and Icon add no targets; the Remove button inherits the
token's text color.

## Family and system relationships

- `family:navigation-destinations` and `spec:AST-005` own destination checks
  for both link structures, including delegated surface clicks; Token adopts
  them through the shared link component and clickable-container delegation.
- `spec:AST-085` owns focusable disabled controls; FR5 and AR5 record Token's
  conformance and its one gap.
- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR3 records one gap against INV5.
- `architecture:component-theming-surface` owns the `token` target and the
  extensible `color` axis; FR8 records the unthemed fallback.
- `architecture:interaction-modality` owns modality and focus-indicator
  ownership; AR4 records which element draws Token's indicator.

## Verification map

| Contract           | Verification                                                                           | Representative states                                        | Mutation or failure expectation                                                                                                                                                                    | Audit section          |
| ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| FR2, FR10          | `Token.test.tsx` render, ref, and pass-through suites                                  | Static, clickable, and link roots; caller props              | A wrong root element, a detached ref, or a dropped caller prop fails DOM assertions. Gap: no test covers the ref on the link-and-remove container.                                                 | `audit:Token/behavior` |
| FR1, FR7           | `Token.stories.tsx` size, icon, and end-content fixtures in a browser                  | Sizes, icon and end content                                  | Gap: the size and overflow unit tests assert presence only, and no story renders a long label; slot order and block size are visible only in the rendered fixtures, and the ellipsis has no check. | `audit:Token/layout`   |
| FR3, FR4, FR6, AR1 | `Token.test.tsx` link, clickable, and link-with-remove suites                          | Link, clickable, link and remove, modified and middle clicks | Nesting the Remove button, firing the token action from Remove, or losing delegation fails. Gap: no test asserts that `onClick` is dropped with `href`.                                            | `audit:Token/behavior` |
| FR5, AR5           | `Token.test.tsx` disabled tests                                                        | Disabled clickable with remove                               | A native `disabled`, a lost tab stop on a button, or a fired callback fails. Gap: no test covers a disabled link token.                                                                            | `audit:Token/a11y`     |
| AR2, AR3, AR7      | `Token.test.tsx` accessibility suite                                                   | Remove name, hidden label, description                       | A missing remove name, lost hidden label, or missing description fails. Gap: no test asserts the link structure's content-derived name.                                                            | `audit:Token/a11y`     |
| AR6                | `TokenRemoveTarget.a11y.chromium.spec.ts`                                              | Pre-set filter tokens (default size), LTR and RTL            | A remove target that misses its X edge or swallows a label press fails in real Chromium. Gap: the `sm` clipping is not covered.                                                                    | `audit:Token/a11y`     |
| FR8                | `Token.test.tsx` custom-color test; `extensibleAxes.test.ts`; `themingTargets.test.ts` | Theme-added color; map wiring                                | Dropping the `color` reflection fails. Gap: no test asserts `data-size` or any tone's paint; those are visible only in `Token.stories.tsx`.                                                        | `audit:Token/theming`  |
| FR9, AR4           | `Token.stories.tsx` clickable and link fixtures in a browser                           | Hover, press, keyboard focus on the token                    | Gap: no automated check covers overlays or indicators, and no story renders a clickable or link token with Remove, so the double indicator on Remove has no fixture.                               | `audit:Token/design`   |
| PR1                | Source review                                                                          | Every structure                                              | Gap: no automated check fails if Token adds a per-token listener, observer, or timer.                                                                                                              | `audit:Token/behavior` |
| AR2, AR3, AR5, AR7 | Accessibility-tree evidence (`spec:AST-009` FR3)                                       | Every structure; hidden label; description; disabled         | Gap: no accessibility-tree check proves the computed names, the hidden-label name, the description, or the disabled state; the unit tests assert DOM attributes only.                              | `audit:Token/a11y`     |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
