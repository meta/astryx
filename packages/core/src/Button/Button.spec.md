---
schema_version: 3
template_version: 7
kind: component
id: component:Button
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Button/Button.test.tsx,
    packages/core/src/ButtonGroup/ButtonGroup.test.tsx,
    packages/core/src/Button/__tests__/Button.a11y.test.tsx,
    packages/core/src/Button/__tests__/Button.a11y.chromium.spec.ts,
    packages/core/src/Layout/__tests__/edgeCompensation.test.tsx,
    packages/core/src/utils/pressFeedback.test.ts,
  ]
modules: []
families: [family:buttons, family:navigation-destinations]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-size-cascade,
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-005, spec:AST-085, spec:AST-086]
---

# Button component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. This record states the shipped Button surface: `label`, variant, size, elevation, content mode, loading and `clickAction`, `isInterruptible`, disabled, tooltip, width, form attributes, and link mode.                                                                                     |
| Behavior                | A named native `<button type="button">` by default. Pending work shows a centered Spinner over content that keeps its space, sets `aria-busy`, and stays focusable. `href` renders a link unless the Button is truly disabled.                                                                            |
| End-user impact         | Everyone gets one action control whose size does not move when it loads. Keyboard users keep focus on a busy Button. A disabled Button without a tooltip is still removed from the tab order, so keyboard users cannot find it or hear that it is disabled.                                               |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                     |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Native `disabled` on a truly disabled Button conflicts with `spec:AST-085` FR1 and FR4, and the press scale and Spinner fade under reduced motion conflict with `design:reduced-motion` DR1 and DR3; all are listed under Current-state impact. |
| Review checks           | Reject a Button with no accessible name, a pending state that changes outer size or drops focus, a fire-once `clickAction` that runs twice for one double-click, a disabled link that still navigates, or `data-*` theme state that disagrees with painted state.                                         |
| Governing rules         | `family:buttons` FR1–FR10; `family:navigation-destinations` FR1–FR7; `spec:AST-085` FR1–FR7; `spec:AST-086` FR3–FR4; `architecture:component-size-cascade` INV3–INV5; `architecture:interaction-modality` INV1, INV5; `design:reduced-motion` DR1, DR3.                                                   |

This table is a review projection; the body below is authoritative.

## Intent

Button is the family's momentary action control. It owns the shared action
surface `family:buttons` assigns to it: native button semantics, accessible
naming, size, visual variant, press and focus feedback, pending presentation,
link mode, and resting elevation. Consumer usage lives in `Button.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; `variant="secondary"`, `size="md"`,
  `elevation="none"`, and `type="button"` are the defaults
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable; Button holds no value.
  Pending state comes from `isLoading` or an in-flight `clickAction`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The action surface: root element choice, accessible name, content order,
  size, width and truncation, variant paint, hover, press, and focus feedback.
- Click and `clickAction` sequencing, fire-once deduplication, and the
  interruptible opt-out.
- Pending presentation: Spinner overlay, hidden content, `aria-busy`, and the
  loading announcement region.
- Busy-only and disabled operability guards.
- Link mode's rendering choice and its disabled fallback.
- Standalone resting elevation and the `button` theme target.
- The ghost variant's edge-compensation marker.

**Does not own / non-goals**

- Connected-group corners, dividers, inherited disabled state, roving focus,
  and shared elevation — owned by `component:ButtonGroup` under
  `family:buttons` FR8 and FR12. Button paints what the group context
  supplies.
- InputGroup addon geometry — owned by `component:InputGroup`.
- Icon-only as a dedicated component — owned by `component:IconButton`.
- Persistent pressed state — owned by `component:ToggleButton`.
- Destination acceptance and custom-router handoff — owned by
  `family:navigation-destinations` and `spec:AST-005`.
- Tooltip appearance, timing, and dismissal — owned by `component:Tooltip`.
- Spinner, Icon, and Badge rendering — owned by those components.
- The touch press controller and `usePressFeedback` — uncontracted shared
  hooks; Button only composes them.

## Public concepts

| Concept       | Closed values or states                                                       | Meaning                                                | Availability by variant/orientation/state                                             | Default                   | Owner              | Stability | Invalid-value behavior                                                                                                            |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------- | ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Variant       | `primary`, `secondary`, `ghost`, `destructive`, plus module-augmented entries | Visual emphasis of the action.                         | Every mode.                                                                           | `secondary`               | `component:Button` | Stable    | TypeScript rejects values absent from `ButtonVariantMap`. An augmented value paints the base surface and reflects `data-variant`. |
| Size          | `sm`, `md`, `lg`                                                              | Control height.                                        | Every mode.                                                                           | Inherited size, else `md` | `family:buttons`   | Stable    | TypeScript rejects other values.                                                                                                  |
| Elevation     | `none`, `low`, `med`, `high`                                                  | Resting shadow depth.                                  | Standalone only; inside a ButtonGroup the effective value is `none`.                  | `none`                    | `family:buttons`   | Stable    | TypeScript rejects other values.                                                                                                  |
| Content mode  | visible label, custom visible content, icon-only                              | What is visible; the accessible name follows ORD4.     | Icon-only drops the visible label and end content.                                    | visible label             | `family:buttons`   | Stable    | Icon-only with no `icon` renders an empty square.                                                                                 |
| Pending       | idle, loading, action pending                                                 | Work is in flight.                                     | `isLoading`, or while a `clickAction` promise is unsettled.                           | idle                      | `component:Button` | Stable    | Not applicable.                                                                                                                   |
| Interruptible | off, on                                                                       | Pending work does not block a new activation.          | Only changes pending behavior.                                                        | off                       | `component:Button` | Stable    | Not applicable.                                                                                                                   |
| Availability  | operable, busy-only, disabled                                                 | Whether activation runs, and why not.                  | Disabled comes from `isDisabled` or an enclosing ButtonGroup; busy-only from pending. | operable                  | `component:Button` | Stable    | Not applicable.                                                                                                                   |
| Link mode     | off, on                                                                       | Renders the surface as a navigation link.              | On when `href` is supplied and the Button is not disabled.                            | off                       | `component:Button` | Stable    | A rejected destination renders inertly under `family:navigation-destinations`.                                                    |
| Width         | content-sized, explicit length                                                | Inline size; numbers are pixels, strings pass through. | Every mode; still capped at the container except icon-only.                           | content-sized             | `component:Button` | Stable    | Not applicable.                                                                                                                   |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| FR1  | Without link mode Button renders one native `<button>` with `type="button"` unless `type` says otherwise; `name`, `value`, and `form` reach that element.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `family:buttons` FR2; current source and tests                         |
| FR2  | Content renders in this order: the leading `icon` slot, the label text (`children` when supplied, else `label`), then `endContent`. Icon-only renders the icon alone and omits the label text and `endContent`. `endContent` inherits the Button's text color.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `family:buttons` AV2; current source and tests                         |
| FR3  | An Astryx Icon in the `icon` slot without an explicit size renders `sm` in `sm` and `md` Buttons and `md` in `lg` Buttons; an explicit Icon size wins.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `family:buttons` FR7; current source                                   |
| FR4  | Height comes from the shared element size for the resolved size, as a minimum that grows with a set text size under `spec:AST-102` FR4 (today's fixed height is a gap): an explicit `size` wins, then the nearest size provider, then `md`. Icon-only is square (`--button-icon-only-aspect`, default `1 / 1`) with no padding.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `family:buttons` FR7; `architecture:component-size-cascade` INV3–INV5  |
| FR5  | The label stays on one line. A labelled Button may shrink in a row, never exceeds its container's inline size, and truncates the label with an ellipsis. An explicit `width` applies in button and link modes and is still capped at the container. Icon-only does not shrink and is not capped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current source and tests                                               |
| FR6  | On activation `onClick` runs first. If it calls `preventDefault()`, `clickAction` does not run. Otherwise `clickAction` runs, and the Button is pending until its promise settles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `family:buttons` FR5; current source and tests                         |
| FR7  | A fire-once `clickAction` runs once per in-flight action: a second activation while it is pending, including a same-tick double-click, does nothing. With `isInterruptible`, a pending Button stays operable and each activation starts a new `clickAction`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `family:buttons` FR5; current source and tests                         |
| FR8  | While pending, Button sets `aria-busy="true"`, hides its content from assistive technology, makes content that takes the Button's text color transparent while it keeps its place in layout, and centers a small Spinner in the inherited foreground color over it. Outer size does not change. On a Button that is not interruptible and has no action pending, explicit `isLoading` hides the content and shows the Spinner at once. For a pending `clickAction`, or any pending state on an interruptible Button, the content stays painted and the content hide and the Spinner reveal both wait the medium motion delay, so a fast action never flashes a Spinner or an empty Button. The Spinner fades in over the fast duration. Under reduced motion there is no delay, and with a fine pointer the Spinner MUST appear at once (`design:reduced-motion` DR3). `aria-busy` is set at once in every case. Implementation gap: under reduced motion the Spinner still fades in over the fast duration with every pointer. Implementation gap: content that paints its own colors, such as a Badge in `endContent`, stays visible beside the Spinner. | `family:buttons` FR4; current source and tests                         |
| FR9  | Busy-only (pending, not disabled, not interruptible): Button exposes `aria-disabled="true"`, keeps its tab stop, renders no native `disabled`, and keeps full opacity. Pointer activation is cancelled and does not reach ancestor click handlers; Enter and Space are suppressed; other keys still reach the caller's `onKeyDown`. A link-mode Button stays a link while busy-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `spec:AST-085` FR1, FR2, FR6; current source and tests                 |
| FR10 | Disabled (`isDisabled`, or a disabled enclosing ButtonGroup) MUST stay focusable with `aria-disabled="true"`, keep its tab stop and focus, apply FR9's guards, never run `onClick` or `clickAction`, and paint at half opacity. Disabled wins over pending: a disabled, loading Button shows the Spinner and `aria-busy` but follows this row. Implementation gap: only a disabled Button with a `tooltip` renders this shape; without a tooltip it renders native `disabled`, which removes it from the tab order and drops focus when it becomes disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `family:buttons` FR3; `spec:AST-085`; current source and tests         |
| FR11 | With `href` and not disabled, Button renders the link component resolved from `as`, then `LinkProvider`, then a native anchor, with `target` and `rel`, full button styling, and no text decoration. Destination handling follows `family:navigation-destinations`. A disabled Button with `href` renders a `<button>` that follows FR10 and never navigates. Implementation gap: a focused link Button that becomes disabled is replaced by that new `<button>`, so focus falls to the page with or without a `tooltip`; without a `tooltip` the `<button>` also carries native `disabled` (FR10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `family:navigation-destinations` FR1–FR7; current source and tests     |
| FR12 | With `tooltip`, the tooltip attaches to the Button element itself (no wrapper element), opens above it, and its content is added to `aria-describedby` after any caller value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source; real-browser accessibility test                        |
| FR13 | A standalone Button paints the shadow token for its `elevation`. Inside a ButtonGroup it paints no shadow and reflects `data-elevation="none"`, whatever `elevation` says.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `family:buttons` FR8–FR10; current source and tests                    |
| FR14 | The root carries `astryx-button` and reflects the effective `data-variant`, `data-size`, and `data-elevation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `family:buttons` FR10; `architecture:component-theming-surface`; tests |
| FR15 | Hover paints the shared interaction overlay on hover-capable pointers, and a mouse press paints the shared pressed overlay. Under a coarse pointer a recognized touch press paints the pressed overlay, which fades out over 200 ms on release. Without a reduced-motion preference, a standalone Button also scales to 0.98 on a mouse press, or while the touch press reads on; under reduced motion it MUST NOT scale (`design:reduced-motion` DR1). All of this paint follows the element's exposed disabled state: a Button that is natively disabled or exposes `aria-disabled="true"` (busy-only, disabled with a tooltip, or a caller's own `aria-disabled`) shows no overlay and no press scale, even when it stays operable. Inside a ButtonGroup the press scale does not apply. Button's hover and press transitions are fast, and instant under reduced motion. Implementation gap: the 0.98 press scale also applies under reduced motion; only its transition becomes instant.                                                                                                                                                              | Current source and tests                                               |
| FR16 | The ghost variant carries the edge-compensation marker so an enclosing container can align it flush with its edge; other variants do not.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source; edge-compensation tests                                |
| FR17 | `ref`, `className`, `style`, `xstyle`, and other DOM props reach the root element. A caller's own `aria-busy` and `aria-disabled` are kept beside Button's own (either one sets the attribute); a caller `aria-disabled` changes exposure and paint only and does not make the Button inert. The tooltip trigger shares the caller's `ref`, which stays attached across rerenders.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests                                               |

### Allowed variation

- **AV1 — Theme paint.** Themes may change variant colors, radius (through the
  `button` target), focus offset (`--button-focus-offset`), and the icon-only
  aspect without changing anatomy, naming, or operability.
- **AV2 — Custom variants.** A module-augmented variant may be painted entirely
  by the theme through `data-variant`; Button supplies only the base surface.
- **AV3 — Visible content.** `children` and `endContent` may be any caller
  content; Button does not inspect them.

### Representative states

| State                  | Required invariant                                                                                                               | Allowed variation                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Text, at rest          | Native button named from its rendered content (icon-slot text, the label, and end-content text), or by a caller `aria-label`.    | Variant, size, theme paint.                 |
| Icon-only              | Square; `aria-label` is `label`; no visible text or end content.                                                                 | Icon content.                               |
| Custom visible content | Visible `children`; `aria-label` is `label`.                                                                                     | Content shape.                              |
| Loading                | Spinner centered; text-colored content hidden but in layout, on the Spinner's schedule; `aria-busy`; focusable; same outer size. | Delay per FR8.                              |
| Disabled with tooltip  | `aria-disabled`; focusable; dimmed; inert; described by the tooltip.                                                             | Tooltip text.                               |
| Disabled, no tooltip   | Same as with a tooltip: `aria-disabled`; focusable; dimmed; inert. Implementation gap: native `disabled` (FR10).                 | —                                           |
| Link mode              | Link element with button styling; busy-only stays a link.                                                                        | Link component from `as` or `LinkProvider`. |
| In a ButtonGroup       | Group corners and dividers; no press scale; effective elevation `none`.                                                          | Orientation.                                |

### Transformation and precedence order

- **ORD1 — Size.** Explicit `size`, then the nearest size provider, then `md`.
- **ORD2 — Availability.** Disabled, then busy-only, then operable.
  Interruptible pending is operable.
- **ORD3 — Element.** Link mode only when `href` is supplied and the Button is
  not disabled; otherwise `<button>`.
- **ORD4 — Accessible name.** Button sets `aria-label` to `label` when it is
  icon-only with a non-empty label, when it is pending and not icon-only, or
  when `children` differs from `label`; that value wins over a caller
  `aria-label`. Otherwise a caller `aria-label`, when given, names the Button,
  and without one the Button is named from its rendered content: any text in the
  `icon` slot, the label text, and any text in `endContent`. A decorative Astryx
  Icon adds nothing to that name.
- **ORD5 — Styling.** Variant paint applies over the shared focus outline, so
  the destructive focus ring takes the error color; caller `xstyle` applies
  after Button's own styles, then `className` and `style` merge.

### Performance and resources

- **PR1 — No idle work.** A Button that mounts idle schedules nothing for its
  loading region. Only a Button first rendered pending defers the region's
  text by one animation frame (AR4).

## Accessibility contract

- **AR1 — Name.** Every Button has an accessible name (ORD4), as
  `family:buttons` FR1 requires: `label` when Button sets `aria-label`, otherwise
  a caller `aria-label` or the rendered content, which includes the label text.
  An icon-only icon never substitutes for the name.
- **AR2 — Keyboard.** A `<button>` activates with Enter and Space; a link
  activates with Enter. Focus order is the DOM order.
- **AR3 — Focus indicator.** Keyboard focus paints the shared focus outline at
  `--button-focus-offset`; the destructive variant colors it with the error
  color. Visibility follows `architecture:interaction-modality` INV1.
- **AR4 — Loading announcement.** Button renders one persistent, visually
  hidden `role="status"` `aria-live="polite"` region. It holds the localized
  loading string while pending and is empty otherwise. A Button first rendered
  pending mounts the region empty and fills it on the next frame
  (`spec:AST-086` FR3). Inside a live container it keeps its role and urgency
  (`spec:AST-086` FR4). Spoken output follows `spec:AST-009`.
- **AR5 — Busy and disabled exposure.** Pending sets `aria-busy`. Busy-only and
  disabled Buttons MUST expose `aria-disabled="true"` on the focusable element
  (`spec:AST-085` FR5). Implementation gap: a disabled Button without a tooltip
  exposes native `disabled` instead (FR10).
- **AR6 — Target size.** Every Button is at least 28 CSS pixels tall. With the
  default square aspect and no `width`, an icon-only Button is at least 28 by
  28; a labelled Button can shrink in a crowded row only down to its 24 CSS
  pixels of inline padding. Both meet the WCAG 2.5.8 24 by 24 minimum. A caller
  `width` or a theme icon-only aspect that makes a Button narrower than 24 CSS
  pixels leaves its target size to that caller or theme.

## Design relationships

| Anatomy or state    | Design requirement                                                                                                | Representation authority                    | Hierarchy role | Component contract |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------- | ------------------ |
| Primary surface     | Accent fill with on-accent text.                                                                                  | Current source                              | Prominent      | FR14               |
| Secondary surface   | Neutral fill with primary text.                                                                                   | Current source                              | Supporting     | FR14               |
| Ghost surface       | Transparent fill with primary text; edge-compensatable.                                                           | Current source                              | Supporting     | FR14, FR16         |
| Destructive surface | Error fill with on-error text and an error-colored focus ring.                                                    | Current source                              | Prominent      | FR14, AR3          |
| Press               | Pressed overlay on a Button not exposed as disabled, plus a 0.98 scale when standalone and motion is not reduced. | Current source; `design:reduced-motion` DR1 | Supporting     | FR15               |
| Disabled            | Half opacity; no hover or press paint.                                                                            | Current source                              | Supporting     | FR10, FR15         |
| Pending             | Spinner over hidden content; full opacity when busy-only.                                                         | Current source                              | Supporting     | FR8, FR9           |

`design:reduced-motion` governs Button's press scale (FR15). No other design
record governs Button; exact paint stays in code and visual evidence.

The root carries the one `button` target (FR14). Icon, Label, and End content
have no target of their own and take color from `button`; the Spinner is a
Spinner instance with the inherited shade. The consumer anatomy names no root
part, so this record carries no anatomy-theming map.

## Family and system relationships

- `family:buttons` owns the shared naming, size, pending, callback-order,
  elevation, and state-agreement rules; Button adopts them and is the surface
  IconButton and ToggleButton reuse.
- `family:navigation-destinations` and `spec:AST-005` own link-mode
  destination handling.
- `spec:AST-085` owns disabled focusability; Button meets it for busy-only and
  tooltip-disabled states and not for other disabled states (FR10).
- `spec:AST-086` owns the loading region's live-region rules (AR4).
- `architecture:component-size-cascade` owns size inheritance (ORD1).
- `architecture:component-theming-surface` owns target and `data-*` rules
  (FR14).
- `architecture:interaction-modality` owns focus-indicator visibility (AR3).

## Verification map

| Contract                     | Verification                                                                                                                                                                                                                         | Representative states                                               | Mutation or failure expectation                                                                                                                                               | Audit section                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| FR1, FR2, AR1                | `Button.test.tsx` label, children, icon-only, end-content presence, and `type` cases; `Button.a11y.test.tsx`; `Button.a11y.chromium.spec.ts`                                                                                         | Text, icon-only, composed label, end content, submit type           | A lost name, a wrong default `type`, or end content in icon-only fails.                                                                                                       | `audit:Button/anatomy`       |
| FR1, FR2 (gaps)              | Evidence gap: no test passes `name`, `value`, or `form`, or asserts the order of icon, label, and end content                                                                                                                        | —                                                                   | —                                                                                                                                                                             | `audit:Button/anatomy`       |
| FR3                          | Evidence gap: no Button-level test of the text-mode icon slot default                                                                                                                                                                | `sm`, `md`, `lg` with an unsized Icon                               | —                                                                                                                                                                             | `audit:Button/anatomy`       |
| FR4                          | Evidence gap: no test asserts the height per size or the explicit `size`, then nearest provider, then `md` order                                                                                                                     | `sm`, `md`, `lg`; inside a size provider                            | —                                                                                                                                                                             | `audit:Button/layout`        |
| FR5                          | `Button.test.tsx` width and narrow-row suites; InputGroup addon case                                                                                                                                                                 | Numeric and string width, link mode, icon-only, grouped             | A Button that overflows its row, stops truncating, or squeezes icon-only fails.                                                                                               | `audit:Button/layout`        |
| FR6, FR7                     | `Button.test.tsx` click, double-click, and interruptible suites                                                                                                                                                                      | onClick then clickAction; preventDefault; double-click; re-click    | Order flips, a prevented click runs the action, or a fire-once action runs twice fails.                                                                                       | `audit:Button/behavior`      |
| FR8, AR4                     | `Button.test.tsx` loading, spinner shade, and live-region suites                                                                                                                                                                     | `isLoading`; pending `clickAction`; first render loading            | Missing `aria-busy`, a wrong Spinner shade, or a live region mounted with text fails.                                                                                         | `audit:Button/behavior`      |
| FR8 (hide and delay)         | Evidence gap: no test asserts the hidden content, the reveal delay, or the reduced-motion path; the shipped Spinner fade fails the fine-pointer reduced-motion clause (Current-state impact)                                         | `isLoading`; pending `clickAction`; interruptible                   | Under reduced motion with a fine pointer, a Spinner opacity below 1 after the loading state starts.                                                                           | `audit:Button/behavior`      |
| FR8 (outer size)             | Evidence gap: no test measures that a pending Button keeps its outer size                                                                                                                                                            | Loading text, icon-only, and end-content Buttons                    | —                                                                                                                                                                             | `audit:Button/layout`        |
| FR9, FR10, AR5               | `Button.test.tsx` aria-disabled, busy-only, and native-disabled suites; `Button.a11y.chromium.spec.ts`                                                                                                                               | Busy-only, tooltip-disabled, disabled, disabled and loading         | A busy Button loses focus, an inert Button fires, or a click reaches an ancestor fails. Native-disabled assertions match the FR10 gap.                                        | `audit:Button/accessibility` |
| FR11                         | `Button.test.tsx` link-mode suites                                                                                                                                                                                                   | Link, busy-only link, disabled `href`                               | A disabled link navigates or a busy link turns into a `<button>` fails.                                                                                                       | `audit:Button/behavior`      |
| FR12                         | `Button.a11y.chromium.spec.ts` described state                                                                                                                                                                                       | Disabled with tooltip                                               | A tooltip that does not describe the Button fails.                                                                                                                            | `audit:Button/accessibility` |
| FR12 (placement and order)   | Evidence gap: no test asserts that the tooltip opens above the Button or that its id follows a caller `aria-describedby`                                                                                                             | Tooltip with and without a caller description                       | —                                                                                                                                                                             | `audit:Button/accessibility` |
| FR13, FR14                   | `Button.test.tsx` theme-target and elevation suites; `ButtonGroup.test.tsx` "reports flat on a member, since the group owns the surface" for the grouped `data-elevation="none"`                                                     | `secondary` target attributes; every elevation tier                 | A missing target, or a `data-elevation` other than the effective tier, fails.                                                                                                 | `audit:Button/theming`       |
| FR13 (painted shadow)        | Evidence gap: no test reads the painted shadow, so a grouped Button that paints its own shadow, or swapped tier shadows, would pass                                                                                                  | Standalone tiers; grouped member                                    | —                                                                                                                                                                             | `audit:Button/theming`       |
| FR14 (per variant)           | Evidence gap: `data-variant` is asserted for `secondary` only                                                                                                                                                                        | Other variants                                                      | —                                                                                                                                                                             | `audit:Button/theming`       |
| FR15                         | `Button.test.tsx` touch pressed-state suite                                                                                                                                                                                          | Touch press on and fading                                           | Losing the touch press arm or its release fade fails.                                                                                                                         | `audit:Button/behavior`      |
| FR15 (disabled paint)        | `pressFeedback.test.ts` "paints nothing on a disabled surface, and does not light the row around it" for the touch press. Evidence gap: no test of the hover and pressed overlays or the mouse scale on a Button exposed as disabled | Native disabled; `aria-disabled`                                    | A disabled surface that takes the touch press fails.                                                                                                                          | `audit:Button/behavior`      |
| FR15 (reduced motion)        | Evidence gap: no test presses a Button under `prefers-reduced-motion: reduce`; the shipped scale fails this clause (Current-state impact)                                                                                            | Mouse press; touch press                                            | A computed transform other than `none` or `scale(1)` during the press.                                                                                                        | `audit:Button/behavior`      |
| FR15 (hover and mouse scale) | Evidence gap: no test asserts the hover overlay or the 0.98 mouse-press scale                                                                                                                                                        | Hover; mouse press, standalone and grouped                          | —                                                                                                                                                                             | `audit:Button/behavior`      |
| FR16                         | `edgeCompensation.test.tsx` Button data-attribute suite                                                                                                                                                                              | Ghost and primary                                                   | A ghost Button without the marker, or a primary Button with it, fails.                                                                                                        | `audit:Button/layout`        |
| FR17                         | `Button.test.tsx` ref suites and the caller `aria-disabled`/`aria-busy` case                                                                                                                                                         | Initial render and rerender; caller `aria-busy` and `aria-disabled` | A dropped or detached ref, or a dropped caller `aria-busy` or `aria-disabled`, fails. Evidence gap: no test asserts that a caller `aria-disabled` leaves the Button operable. | `audit:Button/behavior`      |
| ORD1, ORD5                   | Evidence gap: no test asserts size precedence (see FR4) or that caller `xstyle`, `className`, and `style` win over Button's own styles                                                                                               | —                                                                   | —                                                                                                                                                                             | `audit:Button/behavior`      |
| ORD4                         | `Button.test.tsx` icon-only and composed-label cases. Evidence gap: no test asserts the `aria-label` set while pending or when `children` differs from `label`, or the content name with icon-slot or end-content text               | Icon-only; composed label                                           | An icon-only Button without `aria-label`, or a composed label that gains one, fails.                                                                                          | `audit:Button/accessibility` |
| AR2                          | `Button.a11y.chromium.spec.ts` activation and tab-reachability checks. Evidence gap: no test of Enter activation in link mode                                                                                                        | Text and icon-only Buttons                                          | A Button that Enter or Space does not activate, or that Tab skips, fails.                                                                                                     | `audit:Button/accessibility` |
| AR3                          | Evidence gap: no test asserts the focus outline or the destructive error-colored ring                                                                                                                                                | Keyboard focus; destructive                                         | —                                                                                                                                                                             | `audit:Button/accessibility` |
| AR6, PR1                     | Evidence gap: no test measures the target size or asserts that an idle Button schedules nothing                                                                                                                                      | —                                                                   | —                                                                                                                                                                             | `audit:Button/behavior`      |

## Current-state impact

- **Disabled focusability (FR10, FR11, AR5).** A Button disabled by
  `isDisabled` or a ButtonGroup without a tooltip, including one with `href`,
  renders native `disabled`. It leaves the tab order and drops focus when it
  becomes disabled, against `spec:AST-085` FR1 and FR4 and `family:buttons`
  FR3. The shared button-pattern browser states record this state as not
  focusable. A focused link Button that becomes disabled also loses focus with a
  `tooltip`, because its anchor is replaced by a `<button>`.
- **Consumer docs.** `Button.doc.mjs` describes the Spinner as replacing the
  icon; it overlays all content (FR8). The Chinese `isLoading` text says
  loading disables interaction, and its `icon` text says an icon without
  children renders a square button; icon-only depends on `isIconOnly` (FR2).
- **End-content doc type (AV3).** `Button.doc.mjs` types `endContent` as
  `ReactElement<IconProps> | ReactElement<BadgeProps>`, and its Chinese text says
  it accepts only an Icon or a Badge, while `ButtonProps` types it `ReactNode`
  and any caller content renders.
- **Spinner fade under reduced motion (FR8).** With a fine pointer the Spinner
  still fades in over the fast duration when the person prefers reduced motion,
  against `design:reduced-motion` DR3.
- **Press scale under reduced motion (FR15).** A standalone Button still scales
  to 0.98 on a press when the person prefers reduced motion, against
  `design:reduced-motion` DR1.
- **Self-colored end content while loading (FR8).** A Badge or other content
  that paints its own colors stays visible beside the Spinner.

## Decision log

No component-local decision. Button applies the family and system decisions
linked above.

## Open questions

- **OQ1 — Does VoiceOver on macOS 14 WebKit compute the visible label as the
  Button's name?** (`checkable`) The label sits inside a `display: contents`
  content wrapper. A real-AT receipt under `spec:AST-009` would settle it.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
