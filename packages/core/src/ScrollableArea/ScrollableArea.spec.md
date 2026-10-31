---
schema_version: 3
template_version: 4
kind: component
id: component:ScrollableArea
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-11
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/ScrollableArea/ScrollableArea.test.tsx,
    packages/core/src/hooks/useScrollableArea.test.tsx,
    apps/storybook/stories/ScrollableArea.stories.tsx,
  ]
modules: [module:ScrollableArea/useScrollableArea]
families: []
design_specs: []
architecture:
  [architecture:container-padding, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-025/DEC-1]
---

# ScrollableArea component contract

## Intent

ScrollableArea gives builders a complete native scroll viewport and observable
content box without making them coordinate keyboard access, chaining, edge state,
and native scrollbar presentation. It is the reference composition over the
shared behavior hook, not the exclusive owner of that behavior.

## Compatibility and migration

- Released default preserved: not yet released
- Compatibility class: additive component and package exports
- Controlled/uncontrolled behavior: not applicable
- Migration decision: `spec:AST-025/DEC-1`

## Ownership boundary

**Owns**

- One root native viewport and one real observed inner content box.
- Conditional viewport keyboard access, accessible naming, logical-axis intent,
  overscroll policy, and native scrollbar defaults supplied by the shared hook.
- Optional logical content padding that publishes matching container inset, plus
  opt-in viewport bleed against inherited container padding.

**Does not own / non-goals**

- JavaScript-driven scrolling or custom scrollbar DOM.
- A general Sticky public API or fallback positioning algorithm.
- Existing component-owned viewport migrations such as Layout and Table.

## Public concepts

| Concept            | Closed values or states                    | Meaning                                     | Availability by variant/orientation/state | Default          | Owner                            | Stability | Invalid-value behavior |
| ------------------ | ------------------------------------------ | ------------------------------------------- | ----------------------------------------- | ---------------- | -------------------------------- | --------- | ---------------------- |
| logical axis       | `inline`, `block`, `both`                  | axes where native scrolling is allowed      | all                                       | `block`          | `spec:AST-025`                   | stable    | type error             |
| overscroll         | `allow`, `contain`                         | whether effective axes propagate at an edge | all                                       | `allow`          | `spec:AST-025`                   | stable    | type error             |
| viewport sizing    | `width`, `height`, `maxWidth`, `minHeight` | standard container geometry on the viewport | all                                       | auto             | `component:ScrollableArea`       | stable    | type error             |
| content padding    | shared logical spacing-step ladder         | content-box inset and published geometry    | all                                       | `0`              | `architecture:container-padding` | stable    | type error             |
| full bleed         | `false`, `true`                            | whether viewport escapes inherited inset    | all                                       | `false`          | `architecture:container-padding` | stable    | type error             |
| Sticky containment | `whenScrollable`, `always`                 | whether fitting content captures Sticky     | all                                       | `whenScrollable` | `spec:AST-025`                   | stable    | type error             |
| viewport semantics | `group`, `region` plus required label      | names a conditional keyboard scroll target  | all                                       | `group`          | `component:ScrollableArea`       | stable    | type error             |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                            | Acceptance and implementation state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------- |
| FR1 | The root MUST remain the one native viewport and receive the public ref, standard container sizing props, and styling inputs through StyleX.                                                                                                                                                                                                                                                                                                   | `spec:AST-025` IR3–IR4           | implemented                         |
| FR2 | The inner content wrapper MUST be a real normal-flow block box observed with the viewport, use a 100% minimum size, and use max-content inline sizing only when inline scrolling is requested. Children participate in that box rather than the viewport's flex/grid formatting context, and the minimum block size does not create a definite percentage-height basis; structures that must preserve those semantics adopt the hook directly. | `spec:AST-025` FR5–FR6           | implemented                         |
| FR3 | Native scrollbar behavior MUST remain authoritative; with a fine pointer the default thumb uses `--color-neutral` and the track is transparent, while a coarse primary pointer and forced colors restore platform presentation.                                                                                                                                                                                                                | `spec:AST-025` FR15              | implemented                         |
| FR4 | Scroll-state container queries MAY enhance descendant stuck/edge presentation, but hook state MUST remain the cross-browser source of truth.                                                                                                                                                                                                                                                                                                   | `spec:AST-025` platform support  | implemented progressively           |
| FR5 | The content box MUST apply and publish logical padding with edge-over-axis-over-uniform precedence, defaulting every published edge to zero. `isFullBleed` MUST let only the viewport consume inherited inset; nested content continues to read the content box's published values.                                                                                                                                                            | `architecture:container-padding` | implemented                         |
| FR6 | A fitting viewport MUST use `clip` on both physical axes so it prevents paint overflow without capturing native Sticky. Excess requested-axis geometry MUST activate the writing-mode-resolved `auto`/`hidden` pair. `stickyContainment="always"` MUST explicitly retain that pair while fitting.                                                                                                                                              | `spec:AST-025` FR21              | implemented                         |

### Allowed variation

- **AV1 — Sizing and presentation.** Consumer `xstyle`, `className`, and `style`
  may size the viewport and adjust standards-based native scrollbar properties.
- **AV2 — Content.** Any flow content may render in the observed box; builders
  remain responsible for content semantics.

### Representative states

| State                          | Required invariant                                                                                      | Allowed variation          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------- |
| fitting                        | `clip` on both axes; no tab stop; Sticky passes outward unless containment is `always`; both edges true | viewport size and content  |
| overflowing                    | named tab stop; per-axis logical edge state                                                             | one or both requested axes |
| overflow removed while focused | remove future tab stop without moving focus                                                             | current focus remains      |
| forced colors                  | native platform scrollbar presentation                                                                  | platform rendering         |
| coarse primary pointer         | native platform scroll indicator                                                                        | platform rendering         |

### Transformation and precedence order

- **ORD1 — Props.** Consumer DOM and styling props compose first; behavior-owned
  ref, accessibility, and active-axis chaining win documented conflicts.

### Performance and resources

- **PR1 — Shared, coalesced observation.** Viewport and content resize signals use
  the shared observer, and repeated invalidations publish at most once per frame.

## Accessibility contract

- **AR1 — Conditional access.** The viewport enters sequential navigation only
  while at least one requested axis is effective, with the supplied label and role.
- **AR2 — Focus continuity.** Losing overflow MUST NOT blur or move focus.

## Design relationships

| Anatomy or state | Design requirement                                                                 | Representation authority | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Viewport         | platform scrollbar; with a fine pointer, token-colored thumb and transparent track | `spec:AST-025`           | supporting     | FR1, FR3           |
| Content box      | no independent paint by default                                                    | caller content           | structural     | FR2                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Viewport": {"target": "scrollable-area"},
  "Content box": {
    "none": {
      "reason": "intentional: The content box is structural and paints no component-owned appearance."
    }
  }
}
```

## Family and system relationships

- `module:ScrollableArea/useScrollableArea` owns reusable measurement,
  overflow-boundary, Sticky-containment, accessibility, and registration behavior.
- `architecture:container-padding` owns optional content inset publication and
  opt-in viewport bleed.
- `spec:AST-025` owns shared effective-axis, observation, accessibility, overscroll,
  ownership, edge, and native presentation rules.

## Verification map

| Contract         | Verification                                     | Representative states                                                                                                                              | Mutation or failure expectation                                                                                                     | Audit section                   |
| ---------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1–FR6, AR1–AR2 | component/hook tests and Storybook browser probe | fit, overflow, focused loss, LTR/RTL/vertical, nested allow/contain, fitting Sticky passthrough/containment, native scrollbar, padding, full bleed | duplicate viewport, stale state, dead nested scroll zone, implicit Sticky containment, unconditional tab stop, or stale inset fails | `audit:ScrollableArea/behavior` |

## Decision log

### DEC-1 — The convenience component owns one explicit content box

**Reference:** `component:ScrollableArea/DEC-1`
**Decider:** cixzhang, 2026-09-11

A stable viewport/content structure gives the reference component dependable live
measurement while leaving structure-owning components free to adopt the hook directly.

### DEC-2 — ScrollableArea participates in the container-padding system

**Reference:** `component:ScrollableArea/DEC-2`
**Decider:** cixzhang, 2026-09-11

The content box publishes its actual logical padding, zero by default, so nested
bleed consumers never inherit stale inset. The viewport consumes ancestor inset
only when `isFullBleed` is explicit; scrolling alone does not silently escape its
parent container.

### DEC-3 — Fitting content passes Sticky ownership outward by default

**Reference:** `component:ScrollableArea/DEC-3`
**Decider:** cixzhang, 2026-09-12

A fitting viewport uses `clip` on both axes to prevent a pre-measure paint flash
without becoming a CSS scroll container. Excess requested-axis geometry activates
the writing-mode-resolved scroll boundary. `stickyContainment="always"` is the
explicit opt-in for retaining that boundary while fitting.

## Open questions

None.

## Content boundary

This file does not duplicate consumer examples, the shared hook algorithm, Sticky's
future public API, or migration plans for existing component-owned viewports.
