---
schema_version: 3
template_version: 7
kind: component
id: component:Outline
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers:
  [public-api, behavior, layout, theming, accessibility, interaction]
verified_by:
  [
    packages/core/src/Outline/Outline.test.tsx,
    packages/core/src/Outline/OutlineFocus.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    .github/visual-baseline/manifest.json,
    scripts/check-knowledge.mjs,
  ]
modules: [module:Outline/parseOutlineFromMarkdown]
families: []
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-009, spec:AST-020]
---

# Outline component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `items`, `activeId`, `onActiveIdChange`, `label`, `density`, `onNavigateStart`, `onNavigateEnd`, `offset`, `scrollContainerRef`, `hasScrollOnClick`, root `BaseProps`, `ref`.                                               |
| Behavior                | A labelled navigation list of same-page heading links with keyboard movement, a scroll-tracked current heading, and a sliding indicator.                                                                                    |
| End-user impact         | People see where they are in a long page and jump to any heading by pointer or keyboard, landing below a fixed header.                                                                                                      |
| Builder impact          | A builder's explicit `aria-label` is meant to name the navigation; today `label` or the localized default replaces it (FR1 gap).                                                                                            |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Five implementation gaps are listed under Current-state impact.                                                                                  |
| Review checks           | Reject a link left out of the Tab order or arrow-key movement added without a named exception, a dead link for a missing target, a callback that fires twice, or a lost focus outline.                                      |
| Governing rules         | `architecture:interaction-modality`; `architecture:component-theming-surface`; `architecture:public-component-api` INV5–INV8; `spec:AST-020` FR15; `design:reduced-motion` DR1–DR3; WCAG 2.2 SC 1.3.1, 2.1.1, 2.4.3, 2.4.7. |

This table is a review projection; the body below is authoritative.

## Intent

Outline presents same-page heading navigation: heading links with labels, a
vertical indicator track, and a sliding active indicator that follows the
heading the reader is on. The document owns the headings.

Consumer syntax and examples belong in `Outline.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — localized "Table of contents" label,
  default density, no offset, the nearest scrollable ancestor (else the window)
  as the scroll root, smooth scroll on click.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: the current heading is controlled with
  `activeId` and `onActiveIdChange`, or uncontrolled and tracked from scroll.
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Caller `aria-label` replaced (FR1).** Caller props spread before the
  component's `aria-label`, so a caller `aria-label` is replaced by `label` or
  the localized default; only the `label` prop names the navigation, where
  `architecture:public-component-api` INV5 lets a caller's explicit input
  reach the element.
- **Focus stays on the Outline after navigating (FR4).** Activating a link
  scrolls to the section but leaves focus on the link, so the next Tab moves
  past the Outline, usually back toward the top of the content, instead of
  into the chosen section, where a native in-page link moves the sequential
  focus starting point (WCAG 2.2 SC 2.4.3).
- **The indicator slides under reduced motion (FR6).** The indicator's move
  and resize transition has no reduced-motion branch, where
  `design:reduced-motion` DR1–DR3 have it change at once on a fine pointer and
  cross-fade in 200 ms or less on a coarse one.
- **One roving Tab stop instead of a Tab stop per link (FR3).** Keyboard users
  reach only the current heading's link with Tab and move between links with
  arrow, Home, and End keys, where `spec:AST-020` FR15 keeps a list of
  independently focusable links in the normal Tab order and adds no such keys
  without a named exception. Tests pin today's model.
- **Navigation scrolls smoothly under reduced motion (FR4).** Following a link
  always smooth-scrolls to the heading, where `design:reduced-motion` DR1–DR3
  have a scroll the component starts land at once on a fine pointer and
  cross-fade in 200 ms or less on a coarse one.

## Ownership boundary

**Owns**

- The navigation landmark and its `outline` target, the list, the heading
  links and their `outline-item` target, the labels, the indicator track, and
  the active indicator and its `outline-indicator` target.
- Keyboard focus within the list, scroll tracking, click and keyboard
  navigation, and the navigate callbacks.

**Does not own / non-goals**

- The destination headings and their content — owned by the document or
  product callsite.
- Building `items` from markdown — owned by
  `module:Outline/parseOutlineFromMarkdown`.

## Public concepts

| Concept         | Closed values or states                            | Meaning                                                                                                                                    | Availability by variant/orientation/state | Default                                | Owner               | Stability | Invalid-value behavior           |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | -------------------------------------- | ------------------- | --------- | -------------------------------- |
| Items           | `{id, label, level}` list                          | The headings, in order, with heading level 1–6.                                                                                            | Always                                    | —                                      | caller              | Stable    | Levels clamp to four indents.    |
| Current heading | controlled `activeId`; scroll-tracked              | The heading marked current.                                                                                                                | Always                                    | scroll-tracked                         | `component:Outline` | Stable    | —                                |
| Label           | string                                             | The navigation's accessible name.                                                                                                          | Always                                    | localized default                      | `component:Outline` | Stable    | —                                |
| Density         | `default`; `compact`                               | Link padding.                                                                                                                              | Always                                    | `default`                              | `component:Outline` | Stable    | Closed union; rejected by types. |
| Scroll scope    | `offset`; `scrollContainerRef`; `hasScrollOnClick` | Activation line and landing offset; the scrolled container (else the nearest scrollable ancestor, else the window); whether clicks scroll. | Always                                    | 0; nearest scrollable ancestor; `true` | `component:Outline` | Stable    | —                                |
| Navigate events | `onNavigateStart`; `onNavigateEnd`                 | Fired when a link navigation starts and when its scroll settles.                                                                           | Always                                    | none                                   | caller              | Stable    | —                                |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| FR1 | Outline renders a `nav` carrying the `outline` target, which reflects `density`, named by `label` or the localized "Table of contents", holding a `ul` (`role="list"`) of `li` items, each with a link to `#<id>` whose label truncates with an ellipsis, then an `aria-hidden` indicator track and an `aria-hidden` active indicator. A caller's explicit `aria-label` reaches the `nav` (`architecture:public-component-api` INV5). Implementation gap: the component's `aria-label` replaces it (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests                                                |
| FR2 | Each link carries the `outline-item` target, which reflects `level` and, for the current heading, `active`; the current link has `aria-current="location"`, primary text color, and semibold weight. Heading levels 1 and 2 share the first indent, and levels 3, 4, and 5–6 take the second, third, and fourth.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests                                                |
| FR3 | Each link is in the normal Tab order, and Outline adds no arrow, Home, or End movement between links unless this record names an exception (`spec:AST-020` FR15); Tab leaves the list after its last link. Implementation gap: today the list is one roving Tab stop, seated on the current heading (the first link when none is current, none when empty) and following it unless focus is inside the list, with ArrowDown and ArrowUp moving real DOM focus between links and Home and End jumping to the first and last (Current-state impact; OQ1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests; `spec:AST-020` FR15; WCAG 2.2 SC 2.1.1        |
| FR4 | A click, Enter, or Space on a link whose target exists pushes `#<id>` to history and smoothly scrolls to the heading: at `offset` 0 every scrollable ancestor, the window included, scrolls the heading to the top; with a non-zero `offset` only the scroll root (`scrollContainerRef`, else the nearest scrollable ancestor, else the window) scrolls, landing `offset` pixels plus the heading's own scroll margin below its top; `onNavigateStart` fires when the navigation starts and `onNavigateEnd` exactly once when the scroll settles or the reader interrupts it with a manual scroll, falling back to a timeout when no scroll end arrives; a second navigation ends the first at once, and `onNavigateEnd` does not fire after Outline unmounts mid-scroll. Under reduced motion the navigation scroll does not travel: it lands at once on a fine pointer (`design:reduced-motion` DR3) and cross-fades in 200 ms or less on a coarse pointer (DR2). With `hasScrollOnClick={false}` nothing scrolls: the hash is pushed, the heading marked current, and `onNavigateEnd` fires at once. A click or Enter on a missing target, or any modifier chord, is left to the browser; Space on a missing target does nothing. Following a link moves the sequential focus starting point to the destination, as a native in-page link does (WCAG 2.2 SC 2.4.3). Implementation gaps: the scroll is smooth under reduced motion too; and focus stays on the Outline link, so the next Tab continues after the Outline instead of inside the chosen section (Current-state impact). | Current source and tests                                                |
| FR5 | Uncontrolled, the current heading follows the reader's scroll position in the scroll root (`scrollContainerRef`, else the nearest scrollable ancestor, else the window), using an activation line shifted by `offset` and each heading's own scroll margin; the first heading is current before any heading passes the line, and the last heading is current once the scroll root reaches its end; a click marks its heading current once the scroll settles. Uncontrolled, `onActiveIdChange` reports each change of the current heading, from scroll or a click; controlled, the Outline does not track scroll, `activeId` decides, and `onActiveIdChange` reports the heading a click selects. Keyboard focus movement and the component's own navigation scroll are not treated as manual scrolling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and tests                                                |
| FR6 | The active indicator is a 2px `--color-icon-primary` bar over a 2px `--color-border` track at the inline start, positioned against the current link with CSS anchor positioning and moving with a fast standard transition. Under reduced motion the indicator does not travel: on a fine pointer it changes at once (`design:reduced-motion` DR3), and on a coarse pointer it cross-fades in 200 ms or less (DR2). Implementation gap: the transition has no reduced-motion branch, so the indicator still slides (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests                                                |
| FR7 | The keyboard-focused link shows the shared focus outline in every supported context.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source; browser evidence; `architecture:interaction-modality`   |
| FR8 | `ref`, DOM, data, and event props, `xstyle`, `className`, and `style` reach or compose on the `nav`; `data-testid` reaches it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current source and tests; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Headings.** Heading count, labels, levels, and the current heading
  vary without changing the anatomy.
- **AV2 — Density.** Default and compact density use the same anatomy and
  targets.

### Representative states

| State                  | Required invariant                                                                                                               | Allowed variation |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Uncontrolled scrolling | The current heading follows scroll; `onActiveIdChange` reports it.                                                               | Offset.           |
| Controlled             | `activeId` decides; clicks report through `onActiveIdChange`.                                                                    | —                 |
| Keyboard               | Tab visits each link; Enter and Space navigate; no arrow, Home, or End movement (today a single roving stop with them, FR3 gap). | —                 |
| Missing target         | A click or Enter behaves as a plain link; Space does nothing; no callbacks.                                                      | —                 |
| Empty                  | Track and indicator render; no links and so no tab stop.                                                                         | —                 |

### Transformation and precedence order

- **ORD1 — Current heading.** Controlled `activeId` → scroll position.
- **ORD2 — Activation.** Modifier chord, or a click or Enter on a missing
  target → browser default; Space on a missing target → nothing; otherwise push
  the hash, scroll, and fire the callbacks.

### Performance and resources

- **PR1 — Scroll tracking.** While uncontrolled, Outline listens to scroll on
  its scroll root while mounted; navigation waits for scroll end with a timeout
  fallback; Outline installs the shared press controller.

## Accessibility contract

- **AR1 — Navigation landmark.** The `nav` is named by a caller's explicit
  `aria-label`, else by `label` or the localized default (FR1 gap), and the list
  and items keep list semantics (WCAG 2.2 SC 1.3.1).
- **AR2 — Current location.** The current link exposes
  `aria-current="location"`; the indicator and track are hidden from assistive
  technology.
- **AR3 — Links in Tab order with real focus.** Every link takes keyboard focus
  through the normal Tab order and keeps real DOM focus, not
  `aria-activedescendant` (`spec:AST-020` FR15). Implementation gap: today one
  roving Tab stop with arrow, Home, and End keys (FR3).

## Design relationships

| Anatomy or state | Design requirement                                           | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Outline          | Groups heading navigation and the indicator.                 | Current source and docs  | Supporting     | FR1                |
| Heading link     | Navigates to one heading and carries level and active state. | Current source and docs  | Prominent      | FR2–FR4            |
| Label            | Heading text inside its link, truncated with an ellipsis.    | Current source and docs  | Prominent      | FR1, FR2           |
| Indicator track  | The vertical rule behind the active marker.                  | Current source and docs  | Supporting     | FR6                |
| Active indicator | The marker aligned to the current link.                      | Current source and docs  | Supporting     | FR6                |

The Label sits inside the `outline-item` target and inherits its text
treatment. The Indicator track's target exposure is unsettled (OQ2).

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Outline": {"target": "outline"},
  "Heading link": {"target": "outline-item"},
  "Label": {"inherits": "outline-item"},
  "Indicator track": {
    "none": {
      "reason": "unsettled: No current public target reaches this part"
    }
  },
  "Active indicator": {"target": "outline-indicator"}
}
```

## Family and system relationships

- `module:Outline/parseOutlineFromMarkdown` builds `items` from markdown.
- `architecture:interaction-modality` owns focus indication; FR7 applies it.
- `architecture:component-theming-surface` owns target mapping, inherited
  parts, and unsettled dispositions.
- `architecture:public-component-api` owns caller-input routing; FR1 records
  the `aria-label` gap and FR8 applies the rest.
- `spec:AST-009` owns accessibility-tree evidence; the verification map names
  its gap.

## Verification map

| Contract            | Verification                                                                                                                                     | Representative states                                                                                                                   | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                        | Audit section            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| FR1, AR1            | `Outline.test.tsx` labelled-nav, default-label, class, and track tests; stable visual baselines `core-outline--basic` (neutral and probe themes) | Items; default label; track and indicator                                                                                               | A missing `nav` name, link, or indicator, or a lost `outline` class, fails; a changed default outline comes back changed for review. Gap: the track test matches any `aria-hidden` element, so a missing track passes; no test covers the Label wrapper or its truncation, or a caller `aria-label`; and no accessibility-tree check proves the landmark name (`spec:AST-009` FR3).                                                                    | `audit:Outline/a11y`     |
| FR2, AR2            | `Outline.test.tsx` controlled `aria-current`, item class, and active-anchor tests                                                                | Controlled current; active ordering                                                                                                     | A missing `aria-current`, `outline-item` class, active class, or `data-level`, or an active link after the indicator, fails. Gap: the level indents have no unit check.                                                                                                                                                                                                                                                                                | `audit:Outline/theming`  |
| FR3, AR3            | `Outline.test.tsx` keyboard suite                                                                                                                | One tab stop; real focus; seat on current; follow current; no yank; arrows; Home and End; Tab; one and zero items                       | More than one tab stop, `aria-activedescendant` use, a tab stop off the current heading, a stop that moves while focus is inside, or a broken arrow, Home, End, or Tab path fails. Known gap: these tests pin today's single roving stop and arrow keys, the FR3 gap, rather than the per-link Tab order FR3 requires; no test covers that order.                                                                                                      | `audit:Outline/keyboard` |
| FR4, ORD2           | `Outline.test.tsx` navigate-callback and scroll-scoping suites                                                                                   | Click, Enter, Space; settle; timeout; double settle; interruption; missing target; modifier; `hasScrollOnClick={false}`; offset landing | A navigation that does not scroll, a callback that fires zero or twice, or a missing target or modifier chord that is intercepted fails. No test covers where focus goes after navigating. No test covers the reduced-motion navigation scroll. No test covers a second navigation ending the first, `onNavigateEnd` not firing after an unmount mid-scroll, or Space on a missing target. No test checks the hash push after a successful navigation. | `audit:Outline/behavior` |
| FR5, ORD1           | `Outline.test.tsx` scroll-tracking, controlled, offset, scroll-margin, and scoped-container tests                                                | Uncontrolled scroll; controlled API; offset; scroll margin; container; keyboard and own scroll                                          | A current heading that ignores the offset or scroll margin, tracks the wrong container, or treats keyboard focus or its own scroll as manual fails. No test dispatches a `scroll` event, so the scroll-event path of tracking has no check.                                                                                                                                                                                                            | `audit:Outline/behavior` |
| FR6                 | `Outline.test.tsx` indicator tests                                                                                                               | Indicator present; active anchor order                                                                                                  | A missing indicator fails (a missing track does not; see FR1). Gap: indicator position, size, color, and motion have no automated check beyond the baselines. No test covers the reduced-motion outcome.                                                                                                                                                                                                                                               | `audit:Outline/design`   |
| FR7                 | `OutlineFocus.a11y.chromium.spec.ts`                                                                                                             | Every supported context                                                                                                                 | A focused link without a visible outline fails in Chromium.                                                                                                                                                                                                                                                                                                                                                                                            | `audit:Outline/a11y`     |
| FR8                 | `Outline.test.tsx` class tests; source review                                                                                                    | Caller class                                                                                                                            | Gap: no test covers `ref`, DOM props, `style`, or the `xstyle` merge order.                                                                                                                                                                                                                                                                                                                                                                            | `audit:Outline/api`      |
| PR1                 | `Outline.test.tsx` settle tests; source review                                                                                                   | Settle and fallback                                                                                                                     | A callback after the fallback and scroll end both elapse fails. Gap: listener cleanup has no check.                                                                                                                                                                                                                                                                                                                                                    | `audit:Outline/behavior` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                    | Canonical anatomy and current targets                                                                                                   | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                                                                                                                                          | `audit:Outline/theming`  |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

- **OQ1 — Should Outline adopt a named `spec:AST-020` FR15 exception: one Tab
  stop for a long heading list, with arrow, Home, and End movement?**
  (`human-api`) Adopting it would make today's model the contract: a long
  heading list costs one Tab stop, and keyboard users move inside it with the
  arrow keys, which Tab-only screen reader users may not discover. Without it,
  FR3's per-link Tab order stands and today's model stays the gap.
- **OQ2 — Should Indicator track gain a stable public theming target?**
  (`human-api`) Target exposure is unsettled; the current lack of reachability
  does not decide the answer.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or system rules. It links to their owners.
