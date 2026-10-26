---
schema_version: 3
template_version: 7
kind: component
id: component:Link
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility, navigation]
verified_by:
  [
    packages/core/src/Link/Link.test.tsx,
    packages/core/src/Link/__tests__/Link.a11y.test.tsx,
    packages/core/src/Link/__tests__/Link.a11y.chromium.spec.ts,
    packages/core/src/Link/__tests__/Link.navigation.a11y.chromium.spec.ts,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: [design:user-states]
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-005, spec:AST-085]
---

# Link component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. Link takes `href`, `as`, `label`, `onClick`, `isDisabled`, `isExternalLink`, `newTabLabel`, `target`, `rel`, `download`, `referrerPolicy`, `hasUnderline`, `isStandalone`, `tooltip`, Text props, and `children`.                                                                                                                                                                      |
| Behavior                | An enabled Link with `href` is a link rendered by `as`, then `LinkProvider`, then a native anchor. Otherwise it is a link-styled `<button>`, except that an inherited link role renders the link component, and a disabled Link with `href` and no `onClick` renders a plain anchor unless an inherited button role makes it a disabled `<button>` (FR1). A disabled Link stays focusable and inert. |
| End-user impact         | People get one link look for navigation and link-styled actions. Keyboard and screen-reader users can reach a disabled Link and hear that it is disabled. External links without `label` announce that they open a new tab.                                                                                                                                                                          |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                                                                                                                |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. A focused link that becomes disabled loses focus, caller attributes can replace Link's disabled exposure and `data-color`, and an ancestor Text line clamp cannot truncate a Link; all are listed under Current-state impact.                                                                                                              |
| Review checks           | Reject a disabled Link that navigates, runs `onClick`, or leaves the tab order; a `_blank` target without `noopener noreferrer`; an external link with no new-tab text; or a rejected destination that reaches a router.                                                                                                                                                                             |
| Governing rules         | `family:navigation-destinations` FR1–FR7; `spec:AST-005`; `spec:AST-085` FR1, FR2, FR4, FR5; `architecture:interaction-modality` INV1; `design:user-states` DR1, DR2.                                                                                                                                                                                                                                |

This table is a review projection; the body below is authoritative.

## Intent

Link is the styled navigation link. It decides whether it renders a link or a
link-styled button, keeps a disabled link reachable and inert, adds new-tab
safety and announcement for external links, and sets link typography and color.
Consumer usage lives in `Link.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; `color="accent"`, `type="body"`,
  `display="inline"`, `maxLines={0}`, no underline at rest
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The rendered element: link component, disabled anchor, or link-styled
  button.
- Disabled operability for every element form.
- `target` and `rel` safety and the external-link icon and new-tab text.
- Link typography (through Text), color, underline, hover, press, and focus
  paint.
- The `link` target.

**Does not own / non-goals**

- Destination acceptance and custom-router handoff — owned by
  `family:navigation-destinations` and `spec:AST-005`, through the shared link
  boundary.
- The subtree link component — owned by `component:LinkProvider`.
- Text typography and truncation — owned by `component:Text`.
- Tooltip behavior — owned by `component:Tooltip`.
- `useLinkify` and `useLinkComponent` — public hooks without their own module
  records; uncontracted here beyond their use above.
- Button-surface links — owned by `component:Button` link mode.

## Public concepts

| Concept       | Closed values or states                                                                            | Meaning                                           | Availability by variant/orientation/state                                                             | Default                 | Owner            | Stability | Invalid-value behavior                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------- | ---------------- | --------- | -------------------------------------------------------------------------------------- |
| Element form  | link, disabled anchor, button                                                                      | What Link renders (FR1).                          | Derived from `href`, `onClick`, `isDisabled`, and an inherited interactive role.                      | link when `href` is set | `component:Link` | Stable    | A rejected destination renders an inert anchor (`family:navigation-destinations` FR6). |
| External link | off, on                                                                                            | Opens in a new tab with an icon and new-tab text. | Link and disabled-anchor forms.                                                                       | off                     | `component:Link` | Stable    | Not applicable.                                                                        |
| Color         | `primary`, `secondary`, `accent`, `disabled`, `placeholder`, `inherit`, plus augmented Text colors | Link text color.                                  | Every form.                                                                                           | `accent`                | `component:Link` | Stable    | An augmented color colors the Text only; the root paints no color for it.              |
| Underline     | on hover, always                                                                                   | When the underline shows.                         | Hover underline on enabled forms; `hasUnderline` underlines at rest in every form, disabled included. | on hover                | `component:Link` | Stable    | Not applicable.                                                                        |
| Standalone    | off, on                                                                                            | Body font size outside running text.              | Every form.                                                                                           | off                     | `component:Link` | Stable    | Not applicable.                                                                        |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| FR1  | Element form, in order: (a) `href` set and enabled → the link component from `as`, then `LinkProvider`, then a native anchor, with `href`, `target`, `rel`, and `onClick`. (b) Otherwise, `onClick` set → `<button type="button">`. (c) Otherwise an inherited interactive role decides: `button` → `<button type="button">`, `link` → the link component, or the disabled anchor of (d) when disabled. (d) Otherwise, `href` set and disabled → a plain `<a role="link">` with no `href`; otherwise `<button type="button">`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `family:navigation-destinations` FR1, FR2; current source and tests                               |
| FR2  | `isExternalLink` sets `target="_blank"`. Whenever `target` is `_blank`, `rel` contains `noopener` and `noreferrer` in addition to every caller token. `download` and `referrerPolicy` reach the element.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `family:navigation-destinations` FR5, AV4; current tests                                          |
| FR3  | An external Link that is not rendered as a button shows a trailing extra-small external-link icon that inherits the root's color, followed by visually hidden new-tab text: `newTabLabel`, else the localized default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests                                                                          |
| FR4  | A destination reaches the link component only through the shared navigation rule; a rejected destination renders an inert anchor and never invokes a router.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `family:navigation-destinations` FR1–FR6; `spec:AST-005`                                          |
| FR5  | A disabled Link stays focusable with `aria-disabled="true"`, never navigates, and never runs `onClick`. The disabled anchor form omits `href`, `target`, and `rel`, takes a Tab stop, and skips the custom link component. In every form, clicks are cancelled and stopped, Enter and Space are suppressed, other keys reach the caller's `onKeyDown`, and the Link paints at half opacity with no pointer events and no press paint. A focused Link that becomes disabled MUST keep focus and expose the change on that element (`spec:AST-085` FR4, FR5), and a caller `aria-disabled`, `role`, or `tabIndex` MUST NOT replace the disabled exposure (`architecture:public-component-api` INV5). Implementation gap: caller props spread after Link's own, so a caller `aria-disabled`, `role`, or `tabIndex` overrides them. Implementation gap: an enabled link renders through the safe link component and a disabled one as a plain anchor (or a `<button>` when it has `onClick`), so a focused link that becomes disabled (or re-enabled) is replaced and focus falls to the page. | `spec:AST-085` FR1, FR2, FR4, FR5; `family:navigation-destinations` FR7; current tests            |
| FR6  | Children render inside Text with `type` (default `body`), `size`, `weight`, `color` (default `accent`), `display` (default `inline`), and `maxLines` (default `0`). The root inherits font family, size, weight, and line height and lays content out with a small gap; `isStandalone` sets the body size and leading on the root. A Link inside a Text with `maxLines` MUST truncate with that text. Implementation gap: the root is `inline-flex`, so an ancestor Text clamp does not truncate it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests                                                                          |
| FR7  | The root paints the chosen color for the six built-in colors, which the underline and the external icon take; the label's color comes from Text (FR6). On hover-capable pointers an enabled Link underlines on hover, and for `primary`, `secondary`, and `accent` the root color mixes in the hover tint. `hasUnderline` underlines at rest.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests                                                                          |
| FR8  | Press feedback follows `design:user-states` DR1 and DR2 for Link's text surface: an enabled link or button form paints the pressed overlay, and a disabled Link does not.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `design:user-states` DR1, DR2; current tests                                                      |
| FR9  | `label`, when non-empty, becomes `aria-label` and replaces the content as the accessible name; a caller `aria-label` overrides it; otherwise the content is the name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current tests                                                                                     |
| FR10 | With `tooltip`, Link renders inside a Tooltip that opens above it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests                                                                          |
| FR11 | The root carries `astryx-link` and reflects `data-color`. `ref`, `className`, `style`, `xstyle`, and other DOM props reach the root. Implementation gap: caller props spread after the theme props, so a caller `data-color` replaces the reflected one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `architecture:component-theming-surface`; current tests; `architecture:public-component-api` INV5 |

### Allowed variation

- **AV1 — Content.** `children` may be text or caller content such as an icon;
  Link does not inspect it.
- **AV2 — Router.** Any link component accepted by the shared boundary may
  render the link form.

### Representative states

| State                | Required invariant                                                            | Allowed variation |
| -------------------- | ----------------------------------------------------------------------------- | ----------------- |
| Native link          | Anchor with `href`; accent color; underline on hover.                         | Color, underline. |
| Router link          | Link component from `as` or `LinkProvider` receives the accepted destination. | Router.           |
| External link        | `_blank`, `noopener noreferrer`, icon, and new-tab text.                      | `newTabLabel`.    |
| Button form          | `<button type="button">` styled as a link; runs `onClick`.                    | —                 |
| Disabled link        | `<a role="link" aria-disabled="true" tabindex="0">` with no `href`; inert.    | —                 |
| Disabled button form | `aria-disabled` button; focusable; inert.                                     | —                 |

### Transformation and precedence order

- **ORD1 — Element form.** FR1's order (a) → (d).
- **ORD2 — Link component.** `as`, then `LinkProvider`, then a native anchor;
  the disabled anchor form always uses a native anchor.
- **ORD3 — Target and rel.** `isExternalLink` overrides `target`; a `_blank`
  target then adds the two safety tokens to `rel`.

### Performance and resources

- **PR1 — No per-link listeners.** Link adds no global listener, observer, or
  measurement; press feedback uses the shared document controller.

## Accessibility contract

- **AR1 — Role.** The link form exposes the link role; the disabled anchor
  form sets `role="link"` explicitly; the button form exposes the button role.
- **AR2 — Disabled.** A disabled Link keeps its Tab stop and exposes
  `aria-disabled="true"` on the focusable element (FR5).
- **AR3 — New tab.** An external link without `label` announces that it opens
  in a new tab through visually hidden text; the icon adds no name (FR3). With
  `label`, the label becomes the whole accessible name (FR9), so the new-tab
  text is not announced unless the caller's label says it.
- **AR4 — Name.** FR9. A `label` on a text link overrides its visible text.
- **AR5 — Focus indicator.** Keyboard focus paints the shared focus outline;
  visibility follows `architecture:interaction-modality` INV1.

## Design relationships

| Anatomy or state | Design requirement                                        | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Label            | Text-colored label; underline on hover or always.         | Current source and tests | Prominent      | FR6, FR7           |
| External icon    | Extra-small trailing icon that inherits the root's color. | Current source and tests | Supporting     | FR3                |
| Disabled         | Half opacity; no hover, press, or pointer interaction.    | Current source and tests | Supporting     | FR5                |

`design:user-states` governs Link's pressed overlay (FR8); no other design record
governs Link. The root carries the `link` target, which paints the underline and the
external icon; the label is a Text and takes its color from Text's `text` target
(`architecture:component-theming-surface` INV5). The consumer anatomy names no root part, so this record
carries no anatomy-theming map.

## Family and system relationships

- `family:navigation-destinations` and `spec:AST-005` own destination
  handling (FR4); Link is a member and keeps its own disabled semantics (FR7 of
  the family).
- `spec:AST-085` owns disabled focusability; Link meets FR1, FR2, and FR5's
  steady-state exposure in every form, but not FR4 or FR5's transition clause
  for a focused link with `href` (FR5 gap).
- `component:LinkProvider` supplies the subtree link component (ORD2).

## Verification map

| Contract         | Verification                                                                                                      | Representative states                                    | Mutation or failure expectation                                                                                                                                                                                                                                                                                                         | Audit section              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1, AR1         | `Link.test.tsx` element-form, `as`, and provider cases; `Link.a11y.chromium.spec.ts`                              | Native, router, button form, disabled                    | A wrong element form or role fails. Evidence gap: no test renders Link under an inherited interactive role (FR1 (c)).                                                                                                                                                                                                                   | `audit:Link/anatomy`       |
| FR2, FR3, AR3    | `Link.test.tsx` external, target, rel, and new-tab cases; `Link.a11y.chromium.spec.ts` external state             | External; explicit `_blank`; custom label                | A missing safety token, icon, or new-tab text fails. Evidence gap: no test checks the accessible name of an external link with `label`. Evidence gap: no test sets `referrerPolicy` or asserts the external icon's size or color.                                                                                                       | `audit:Link/accessibility` |
| FR4              | `Link.navigation.a11y.chromium.spec.ts`                                                                           | Rejected and ordinary schemes; native, router, downloads | A rejected destination that navigates or reaches a router fails.                                                                                                                                                                                                                                                                        | `audit:Link/behavior`      |
| FR5, AR2         | `Link.test.tsx` disabled cases                                                                                    | Disabled anchor; disabled button form; with `onClick`    | Navigation, a consumer `onClick`, a lost Tab stop, or a custom component on a disabled link fails. Evidence gap: no test disables a focused link or passes a caller `aria-disabled`, `role`, or `tabIndex`. Evidence gap: no test asserts that other keys reach the caller's `onKeyDown`, or the half-opacity, no-pointer-events paint. | `audit:Link/accessibility` |
| FR6 (type)       | `Link.test.tsx` text-type cases                                                                                   | Default `body`; `type="inherit"`                         | A dropped Text `type` fails. Evidence gap: no test asserts that `size`, `weight`, `color`, `display`, or `maxLines` reach Text, or the `isStandalone` root size.                                                                                                                                                                        | `audit:Link/visual`        |
| FR6, FR7 (paint) | Evidence gap: the color, underline, and standalone cases assert only that a link renders; hover paint is untested | Each color; `hasUnderline`; `isStandalone`               | —                                                                                                                                                                                                                                                                                                                                       | `audit:Link/visual`        |
| FR8              | `Link.test.tsx` pressed-state suite                                                                               | Link, button form, disabled                              | No press paint, or press paint on a disabled Link, fails.                                                                                                                                                                                                                                                                               | `audit:Link/behavior`      |
| FR9, FR11, AR4   | `Link.test.tsx` label, ref, and theme-class cases                                                                 | With and without `label`; `data-color`                   | A missing or extra `aria-label`, target, `data-color`, or ref fails. The accessibility suites assert a passed `data-*` attribute and `aria-current` on the root, and the navigation suite asserts `download`. Evidence gap: no test passes both `label` and `aria-label`, or passes `className`, `style`, or `xstyle`.                  | `audit:Link/theming`       |
| FR10             | Evidence gap: the tooltip case asserts only that the link renders                                                 | Tooltip                                                  | —                                                                                                                                                                                                                                                                                                                                       | `audit:Link/accessibility` |
| ORD1–ORD3        | Covered by the FR1–FR3 rows                                                                                       | —                                                        | —                                                                                                                                                                                                                                                                                                                                       | `audit:Link/behavior`      |
| PR1, AR5         | Evidence gap: no test asserts the absence of per-link listeners or the focus indicator                            | —                                                        | —                                                                                                                                                                                                                                                                                                                                       | `audit:Link/accessibility` |

## Current-state impact

- **Caller attributes (FR5, FR11).** A caller `aria-disabled`, `role`,
  `tabIndex`, or `data-color` replaces Link's own, against
  `architecture:public-component-api` INV5.
- **Becoming disabled (FR5).** A focused link with `href` that becomes disabled
  is replaced by the plain disabled anchor, or by a `<button>` when it has
  `onClick`, so keyboard focus falls to the page and the change is not exposed
  on the focused element, against `spec:AST-085` FR4 and FR5.
- **Ancestor line clamp (FR6).** The root is inline-flex, so an ancestor Text
  `maxLines` clamp does not truncate a Link inside it.
- **Consumer docs.** `Link.doc.mjs` anatomy lists Left icon and Right icon
  parts; Link renders no icon slots, only caller content and the external icon
  (FR3).

## Decision log

No component-local decision. Link applies `family:navigation-destinations` and
`spec:AST-085`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
