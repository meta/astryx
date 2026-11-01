---
schema_version: 3
template_version: 7
kind: component
id: component:Tab
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/TabList/TabList.test.tsx,
    packages/core/src/TabList/__tests__/Tabs.a11y.test.tsx,
    packages/core/src/TabList/__tests__/Tabs.a11y.chromium.spec.ts,
    apps/storybook/stories/TabList.stories.tsx,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-style-authoring,
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:component-theming-surface,
  ]
contributing: []
system_specs: []
---

# Tab component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `Tab` with `value`, `label`, `isLabelHidden`, `href`, `as`, `panelId`, `icon`, `selectedIcon`, and `endContent`; targets `tab` and `tab-indicator` with a `selected` state.                                                                                                          |
| Behavior                | One TabList entry. In the navigation pattern it is a button or, with `href`, a link marked `aria-current` when selected; in the tabs pattern (`role="tablist"`) it is a `role="tab"` button that controls its panel. The strip has one tab stop, which starts on the selected entry. |
| End-user impact         | Users select a view or destination; keyboard users meet one tab stop for the whole strip; screen-reader users hear the selected entry and, in the tabs pattern, the panel it controls.                                                                                               |
| Builder impact          | None.                                                                                                                                                                                                                                                                                |
| Compatibility/readiness | Records shipped behavior; no public change. Four implementation gaps (see Current-state impact).                                                                                                                                                                                     |
| Review checks           | Reject more than one tab stop per strip, `aria-current="page"` on a navigation tab, a disabled tab that fires its handler or navigates, or a tabs-pattern tab that renders a link.                                                                                                   |
| Governing rules         | `component:TabList` (strip edge geometry); `family:navigation-destinations`; `architecture:interaction-modality`.                                                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

Tab is one entry in a TabList. It owns its element and role in each TabList
pattern, its selected and disabled behavior, its icon swap, label sizing, and
its selection indicator. Consumer usage lives in `Tab.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: selection is the TabList's `value`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **A hidden label twin reserves the selected width.** Each visible label
  renders a second, `aria-hidden` copy that reserves the label's selected
  weight so the tab does not shift. `architecture:component-style-authoring`
  INV7 has content render once and has CSS size or reserve it on the element
  that shows it.
- **Hover decoration is an element.** The hover fill is an `aria-hidden` span
  rather than a pseudo-element; `architecture:component-style-authoring` INV7
  has decoration without a semantic role carried by a pseudo-element.
- **Color transitions under reduced motion.** The label color, hover fill,
  pressed fill, and indicator fade still animate when reduced motion is
  requested;
  `design:reduced-motion` DR3 allows no animated property for a fine pointer.
- **The `tab` target does not reflect disabled.** A disabled Tab drops its
  hover and pressed treatment, but the `tab` target reflects only `selected`.
  `architecture:component-theming-surface` INV6 has a state that changes paint
  reflected on the owning target.

## Ownership boundary

**Owns**

- The entry element and role per pattern, selection on activation, disabled
  handling, the tab stop, icon swap, label, end content, and indicator
  (FR1–FR8).

**Does not own / non-goals**

- Which value is selected, the pattern (`role`), size, layout, arrow-key
  movement, and overflow scrolling — owned by TabList and uncontracted here;
  strip edge geometry — owned by `component:TabList`.
- Destination acceptance and blocking — owned by
  `family:navigation-destinations`.
- The panel a tab controls — owned by the caller.

## Public concepts

| Concept | Closed values or states | Meaning                                                   | Availability by variant/orientation/state | Default    | Owner   | Stability | Invalid-value behavior |
| ------- | ----------------------- | --------------------------------------------------------- | ----------------------------------------- | ---------- | ------- | --------- | ---------------------- |
| Pattern | navigation, tabs        | Set by the TabList `role`; decides element and semantics. | Every tab.                                | navigation | TabList | Stable    | Not settable on Tab.   |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                  | Basis                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | In the navigation pattern a Tab is a `<button type="button">`, or with `href` the `as` component, else the `LinkProvider` link, else `<a>`. The selected Tab carries `aria-current="true"`, never `"page"`.                                                                                                                                                | Current source and tests |
| FR2 | In the tabs pattern a Tab is a `<button>` with `role="tab"`, `aria-selected`, and `aria-controls` from `panelId` (else a caller `aria-controls`). `href` is ignored, and development warnings name an ignored `href`, a missing panel, or a `panelId` outside the tabs pattern.                                                                            | Current source and tests |
| FR3 | The strip has one tab stop. It starts on the selected Tab (`tabIndex=0`, every other entry `-1`), and moves to whichever entry the arrow keys, Home, or End focus, without selecting it. Where the stop starts when no entry is selected, or the selected one is disabled, is uncontracted here; the Tabs accessibility inventory leaves that policy open. | Current source and tests |
| FR4 | Activation runs the caller `onClick`, then selects the Tab's `value` through the TabList unless the caller cancelled the event.                                                                                                                                                                                                                            | Current source and tests |
| FR5 | A Tab with `aria-disabled="true"` does not run `onClick`, does not select, and, as a link, renders a plain `<a>` without `href`; it gets no hover or pressed treatment.                                                                                                                                                                                    | Current source and tests |
| FR6 | `isLabelHidden` names the Tab by `label` through `aria-label` and hides the text; the visible label reserves its selected (semibold) width so selection does not shift layout. `selectedIcon` replaces `icon` while selected.                                                                                                                              | Current source and tests |
| FR7 | Every Tab renders an indicator carrying `tab-indicator`, visible only when selected; the root carries `tab` with `selected`. The pressed overlay paints on the tab surface.                                                                                                                                                                                | Current source and tests |
| FR8 | The root forwards the `ref` and other DOM props, merges `className`, `style`, and `xstyle` after component styles, and paints the shared focus outline.                                                                                                                                                                                                    | Current source and tests |

### Allowed variation

- **AV1 — Size and layout.** Height follows the TabList size; `fill` layout
  stretches Tabs.
- **AV2 — Theme styling.** Themes restyle `tab` and `tab-indicator` per selected
  state.

### Representative states

| State             | Required invariant                              | Allowed variation  |
| ----------------- | ----------------------------------------------- | ------------------ |
| Navigation button | `aria-current="true"` when selected.            | Icon, end content. |
| Navigation link   | Link; `aria-current="true"` when selected.      | Router renderer.   |
| Tabs pattern      | `role="tab"`, `aria-selected`, `aria-controls`. | —                  |
| Icon only         | Named by `label`.                               | Icon.              |
| Disabled          | No selection, handler, or navigation.           | Muted styling.     |

### Transformation and precedence order

- **ORD1 — Element.** Tabs pattern → button; else `href` → link (disabled →
  plain `<a>`); else button.
- **ORD2 — Controls.** `panelId`, then caller `aria-controls`.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Pattern semantics.** FR1 and FR2.
- **AR2 — One tab stop.** FR3.
- **AR3 — Names.** Visible label or, when hidden, `aria-label` from `label`.

## Design relationships

| Anatomy or state | Design requirement                                   | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Tab              | Icon, label, end content; stable width on selection. | Current source and public docs | Prominent      | FR6                |
| Indicator        | Selected-only underline.                             | Current source                 | Supporting     | FR7                |

`Tab.doc.mjs` declares no anatomy of its own, so no anatomy-theming map is
recorded. Edge and indicator geometry across the strip is `component:TabList`
FR1–FR2.

## Family and system relationships

- TabList supplies pattern, value, size, layout, and keyboard movement;
  `component:TabList` contracts its edge geometry.
- `family:navigation-destinations` owns the accept/block decision for `href`.

## Verification map

| Contract | Verification                                                                                                                                      | Representative states             | Mutation or failure expectation                  | Audit section             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------ | ------------------------- |
| FR1, FR2 | `TabList.test.tsx` aria-current, polymorphic link, and tabs-pattern tests; `Tabs.a11y.test.tsx`; `Tabs.a11y.chromium.spec.ts` for `aria-selected` | Navigation, link, tabs            | Wrong role or state fails.                       | `audit:Tab/accessibility` |
| FR3      | `TabList.test.tsx` single tab stop and roving tabindex tests                                                                                      | Selected                          | Extra tab stops, or a wrong starting stop, fail. | `audit:Tab/accessibility` |
| FR4, FR5 | `TabList.test.tsx` onChange and disabled tests                                                                                                    | Click, disabled button            | Selection when disabled fails.                   | `audit:Tab/behavior`      |
| FR6, FR7 | `TabList.test.tsx` icon, icon-only, and pressed-overlay tests                                                                                     | Icon, selected icon, hidden label | Wrong icon, name, or overlay fails.              | `audit:Tab/behavior`      |

Read from source, with no focused test yet:

- FR3: the stop moving with arrow, Home, and End focus.
- FR1: the button's `type="button"`.
- FR4: the caller `onClick` running first, and its `preventDefault()`
  cancelling selection.
- FR5: the absent hover and pressed treatment on a disabled Tab.
- FR6: the reserved selected-width label.
- FR7: the `tab` and `tab-indicator` targets and their `selected` state.
- FR8.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, or TabList strip
behavior. It links to their owners.
