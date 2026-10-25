---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-025
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-11
phase: accepted
owners: [cixzhang]
affects_architecture:
  [
    architecture:container-padding,
    architecture:public-component-api,
    architecture:interaction-modality,
  ]
affects_families: [family:layout-regions, family:layout-primitives]
affects_contributing: []
affects_consumer_docs:
  [Layout, Stack, Table, Popover, DropdownMenu, Carousel, CodeBlock, Tooltip]
---

# Scrollable container behavior system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "scrolling": ["FR1", "FR12", "FR13", "FR14", "FR15", "FR16", "FR18"]
  }
}
```

## Intent

People should be able to reach and scroll overflowing content, continue scrolling
the containing page when a nested area has nothing to scroll, and understand which
content remains pinned while they move. Builders should not have to coordinate
accessibility, sticky positioning, overscroll containment, scrollbar presentation,
and browser-specific overflow behavior independently.

This spec defines one axis-aware scroll-container capability. Shared utility hooks
form the canonical reusable behavior surface so components that already own suitable
structure can participate directly. `ScrollableArea` composes those hooks into a
convenience component and reference implementation; it is not the exclusive path to
the behavior.

## Non-goals

- Selecting the final exported hook names, prop names, or TypeScript spelling in
  this draft; the hooks-first ownership and `ScrollableArea` reference composition
  are settled by DEC-1.
- Replacing browser scrolling with JavaScript-driven movement.
- Requiring custom scrollbar DOM or styling every platform scrollbar identically.
- Making arbitrary overflow values or independent `overflow-x` / `overflow-y`
  combinations part of the public design-system vocabulary.
- Allowing content to paint visibly through the non-scrolling axis of the same
  viewport; CSS does not provide that combination reliably.
- Defining Sticky's complete public API, stacking model, or visual treatment.
- Automatically migrating every current `overflow: auto` callsite.
- Changing Layout's five-slot topology or AppShell's ownership of the page shell.

## Terms

- **Viewport:** the element whose scroll offsets move content.
- **Content box:** a real layout box inside the viewport whose geometry can be
  observed without asking arbitrary descendants to participate.
- **Requested axis:** the logical axis or axes on which the owner intends to allow
  scrolling: `inline`, `block`, or `both`.
- **Effective scroll axis:** a requested axis whose resolved computed overflow is
  user-scrollable and whose content extent exceeds its viewport extent by more
  than the shared tolerance.
- **Effective scroll owner:** the nearest ancestor that has an effective scroll
  axis matching the behavior being resolved.
- **Scrollbar presenter:** native CSS or optional custom UI that represents the
  viewport's existing scroll state without creating another viewport.

## Requirements

- **FR1 — Scroll intent uses logical axes.** The system MUST represent scroll intent
  as `inline`, `block`, or `both`. Writing direction and writing mode determine the
  physical axis. Left, right, top, and bottom MUST NOT define the shared contract.
- **FR2 — Scroll ownership is explicit and local.** A participating container MUST
  identify one viewport and its content box. Descendants MUST receive the same
  per-axis owner state whether the capability is delivered through a standalone
  component or integrated into an existing component-owned element.
- **FR3 — Effective scrolling requires scroll-capable style and measurable
  overflow.** Resolve the requested logical axis through the viewport's computed
  writing mode before reading physical geometry. In horizontal writing modes,
  inline compares `scrollWidth` with `clientWidth` and block compares
  `scrollHeight` with `clientHeight`; vertical and sideways writing modes reverse
  those physical measurements. An axis is effective only when its resolved
  computed overflow is `auto`, `scroll`, or the legacy `overlay` value and its
  content extent exceeds its viewport extent by more than the shared tolerance.
  The initial shared tolerance is 1 CSS pixel. An `overflow: auto` declaration or
  excess geometry alone MUST NOT make the container an effective owner.
- **FR4 — Effective state is axis-specific.** A container may be effective on one,
  both, or neither requested axes. Focusability, sticky ownership, overscroll
  containment, scrollbar presentation, and edge state MUST consume the applicable
  axis rather than one undifferentiated `hasOverflow` boolean.
- **FR5 — Live measurement observes viewport and content geometry.** The system
  MUST observe both the viewport box and a real content layout box. A viewport-only
  `ResizeObserver` is insufficient because content may grow while the viewport's
  own box remains unchanged. `display: contents` is not a valid content observation
  target because it has no dependable box geometry.
- **FR6 — Existing structure may supply the content box.** A component that already
  owns a suitable content root MAY register it directly. A reusable behavior MUST
  NOT silently insert a wrapper around arbitrary children. When an implementation
  creates a content wrapper, it MUST document and verify that wrapper's formatting,
  sizing, flex/grid participation, percentage sizing, and intrinsic-size effects.
- **FR7 — Invalidation covers more than element resize.** The system MUST measure
  after initial connection, viewport or content-box resize, requested-axis or
  relevant style changes, and transition from unmeasurable/hidden to rendered.
  Integrations whose overflow can change without either observed box resizing MUST
  provide an explicit invalidation path or an equivalent bounded signal. Repeated
  invalidations in one frame MUST coalesce into one measurement.
- **FR8 — Unmeasurable is not fitting.** A disconnected, `display: none`, or
  zero-geometry viewport MUST NOT be treated as evidence that content fits. The
  implementation MAY keep the last valid state or expose an internal unknown state,
  but MUST remeasure when the viewport becomes measurable.
- **FR9 — State updates are stable.** The shared observer MUST publish a new state
  only when effective axes or requested edge information changes. Measurement MUST
  converge without an overflow/scrollbar feedback loop, including on platforms
  whose native scrollbars consume layout space.
- **FR10 — Sticky resolves against effective ownership by axis.** A block-start or
  block-end Sticky participant MUST use the nearest effective block owner. An
  inline-start or inline-end participant MUST use the nearest effective inline
  owner. A non-overflowing candidate and a candidate effective only on the other
  axis MUST be skipped. Arbitrary Sticky placement in flowing content MUST remain
  possible; fixed header/footer slots are not a general substitute.
- **FR11 — Native CSS sticky is conditional implementation detail.** Native
  `position: sticky` MAY be used when the browser's nearest CSS scroll container
  is also the system's effective owner on the requested axis. The implementation
  MUST NOT rely on native ancestor selection where CSS overflow-axis coupling makes
  those owners disagree. This spec does not choose the fallback positioning
  mechanism.
- **FR12 — Keyboard access follows effective scrolling.** Effective scroll content
  MUST remain keyboard reachable as required by WCAG 2.1.1. A delivery surface that
  assigns keyboard scrolling to the viewport MUST add it to the tab order only
  while at least one applicable axis is effective, and MUST provide an appropriate
  role and accessible name. An integration MAY instead rely on an existing
  focusable descendant when that path gives keyboard users access to all overflowed
  content. In shared `contentOrViewport` mode the named viewport MUST retain
  `tabIndex=0` while effectively scrollable. On forward keyboard Tab entry the
  hook MUST inspect the first sequential descendant once and MAY delegate only
  to a native link or button that preserves native scroll keys. It MUST NOT skip
  an excluded first target to reach a later eligible one. Composite widgets,
  nested scroll owners, editable surfaces, and navigation-key-owning roles MUST
  retain the viewport stop. Reverse traversal from the delegated first child
  MUST skip the viewport without a loop. Pointer and programmatic focus MUST NOT
  delegate. Eligibility MUST be recalculated at each keyboard entry without
  persistent subtree or ancestor observation for keyboard eligibility; existing
  geometry observation remains governed by FR5–FR9. Both paths MUST retain clear
  accessible naming and native Arrow/Page access to the full scroll range.
  A tooltip is the one exception: content too tall for the viewport scrolls
  inside it with no keyboard path. Under the ARIA tooltip pattern a tooltip
  never takes focus, and its trigger keeps focus while it is shown; the full
  content stays available to assistive technology through the trigger's
  accessible description; long or essential content belongs in a HoverCard or
  Popover, which do take focus; and the alternative, overflow left outside the
  viewport, reaches no one.
- **FR13 — Losing overflow does not move focus.** If a focused viewport stops
  overflowing, the system MAY remove it from future sequential navigation but MUST
  NOT move or blur current focus solely because geometry changed.
- **FR14 — Scroll chaining is the default.** Nested wheel, touch, and keyboard
  scrolling MUST continue to an ancestor when the current area has no movement in
  the requested direction. A containment policy MAY stop chaining, but its
  `overscroll-behavior` effect MUST be active only on axes that currently overflow.
  This avoids dead scroll zones in engines that honor containment on non-overflowing
  `overflow: auto` elements. Inside a touch presentation under a finger, who
  gets a drag is decided once, when it begins (`spec:AST-094` FR14).
- **FR15 — Native scrollbars are the default presentation.** The default presenter
  MUST preserve native scrolling and use standards-based CSS such as
  `scrollbar-width`, `scrollbar-color`, and `scrollbar-gutter` where supported.
  Unsupported declarations MUST fall back to the platform scrollbar without
  changing scroll ownership or access.
- **FR16 — Custom scrollbars are optional presentation.** A custom track or thumb
  MAY represent an existing viewport, but MUST NOT create a second scroll container,
  replace native scroll mechanics, or maintain an independent source of truth.
  It MUST use the same effective-axis, extent, offset, writing-direction, and
  forced-colors state as the viewport. Hiding the native scrollbar without an
  equivalent visible and operable affordance is not a general default.
- **FR17 — Axis combinations are closed.** The system MUST NOT expose arbitrary
  pairs of `visible`, `clip`, `hidden`, `auto`, and `scroll`. CSS computes
  `visible` to `auto` and `clip` to `hidden` when paired with a non-visible value on
  the other axis, so those apparent combinations do not preserve independent-axis
  semantics. Content that must escape the non-scrolling axis requires separate
  structure or a Layer.
- **FR18 — Nested ownership is deterministic.** The nearest effective owner on the
  applicable axis wins. Orthogonal nested areas MAY coexist. Same-axis nesting MUST
  preserve chaining by default and MUST be deliberate in the owning component's
  contract rather than emerging from incidental overflow styles.
- **FR19 — Table may integrate rather than wrap.** Table MAY adopt the capability
  on its existing scroll wrapper so column sizing, keyboard access, scroll shadows,
  sticky columns, and sticky headers share one viewport. Table MUST NOT require a
  separate public ScrollableArea component merely to participate. An arbitrary
  external wrapper cannot satisfy Table's internal ownership contract unless Table
  explicitly accepts and coordinates that owner.
- **FR20 — The reference component integrates container geometry.** ScrollableArea
  MUST publish the actual logical padding of its content box, using zero when no
  padding is requested. Its viewport MAY consume inherited padding only through an
  explicit full-bleed option; scrollability alone MUST NOT escape a parent container.
- **FR21 — Fitting scroll intent does not imply Sticky containment.** A participating
  viewport whose requested axes have no excess geometry MUST use `clip` on both
  physical axes. This prevents pre-measure paint overflow without creating a CSS
  scroll container, so native Sticky descendants can resolve to an outer effective
  owner. The viewport MUST switch to its requested `auto`/`hidden` pair when content
  exceeds the viewport, before the axis becomes an effective owner. A public
  `stickyContainment="always"` option MAY preserve that boundary while fitting, but
  containment MUST be explicit rather than an incidental result of scroll intent.

### Delivery requirements

- **IR1 — Shared hooks are the behavioral core.** Shared utility hooks MUST own
  effective-axis measurement, observation, invalidation, and owner publication.
  `ScrollableArea` and component-integrated forms MUST consume that core rather
  than creating parallel detectors.
- **IR2 — Behavior does not require `ScrollableArea`.** Components that already
  own a viewport and content root MUST be able to adopt the hooks without adding
  the convenience component or changing their semantic outer element.
- **IR3 — `ScrollableArea` is the reference composition.** The component owns and
  documents its viewport/content structure, applies the shared accessibility,
  chaining, sticky-owner, and scrollbar-presentation rules, and demonstrates how
  another structure-owning component integrates the hooks. It MUST NOT contain
  behavior unavailable to direct hook adopters.
- **IR4 — Structure and prop composition remain explicit.** A hook MUST accept
  caller-owned viewport/content props and refs through prop getters or an equivalent
  composition contract. It MUST compose refs, event handlers, class/style inputs,
  and ARIA without making spread order decide whether caller or behavior is lost.
  Component-owned accessibility and non-cancellable behavior win documented
  conflicts; cancellable handlers use the shared event contract. The hook does not
  pretend structure is unnecessary or silently wrap arbitrary children.
- **IR5 — Public API follows intent.** Future hook and component names expose
  semantic scrolling, chaining, accessibility, or presentation intent. Raw CSS
  values, observer controls, tolerance knobs, and browser workarounds remain
  internal unless a separate admission decision proves caller ownership.

### Candidate shared hook boundary

The exact names and TypeScript spelling remain API-review work. The candidate
boundary is:

```ts
type ScrollAxis = 'inline' | 'block' | 'both';

type KeyboardAccess =
  | {owner: 'content'}
  | {owner: 'viewport'; label: string; role?: 'group' | 'region'}
  | {
      owner: 'contentOrViewport';
      label: string;
      role?: 'group' | 'region';
    };

interface ScrollAxisState {
  isScrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
}

interface UseScrollableAreaOptions {
  axis: ScrollAxis;
  keyboardAccess: KeyboardAccess;
  overscroll?: 'allow' | 'contain';
  stickyContainment?: 'whenScrollable' | 'always';
}

type ElementProps<E extends HTMLElement> = BaseProps<E> &
  React.RefAttributes<E>;

interface UseScrollableAreaResult {
  getViewportProps<E extends HTMLElement>(
    props: ElementProps<E>,
  ): ElementProps<E>;
  getContentProps<E extends HTMLElement>(
    props: ElementProps<E>,
  ): ElementProps<E>;
  state: {
    inline: ScrollAxisState;
    block: ScrollAxisState;
  };
}
```

Each prop getter receives the adopter's already-resolved element props and public
ref, composes them with the hook's behavior through the shared prop/ref utilities,
and returns one safe spread object. `getViewportProps` consumes caller `xstyle` and
adds behavior-owned fitting clip, axis-specific active overflow, explicit Sticky
containment, keyboard, ARIA, event, data-state, overscroll, and registration behavior
without choosing viewport sizing or scrollbar presentation. `getContentProps`
composes content observation with an existing content ref and props. Neither a loose
prop bag nor a separate callback ref makes spread order part of the contract.

Native scrollbar width, color, and gutter remain CSS on the viewport rather than
hook options. Optional custom presenters and scroll shadows consume the same
registered metrics through a narrower subscription so ordinary owners do not
rerender for every scroll offset. Sticky uses a private nearest-owner consumer over
the registered DOM ancestry; adopters do not render a Provider.

An explicit invalidation method remains internal unless real adopters demonstrate an
overflow change that neither observed box nor a bounded platform signal can detect.

### Behavioral matrix

| Requested axes | Inline effective | Block effective | Effective owner state             | Sticky ownership                                              |
| -------------- | ---------------- | --------------- | --------------------------------- | ------------------------------------------------------------- |
| `inline`       | no               | n/a             | none                              | no inline owner; block Sticky skips the candidate             |
| `inline`       | yes              | n/a             | inline                            | inline Sticky resolves here; block Sticky skips it            |
| `block`        | n/a              | no              | none                              | no block owner; inline Sticky skips the candidate             |
| `block`        | n/a              | yes             | block                             | block Sticky resolves here; inline Sticky skips it            |
| `both`         | yes/no           | yes/no          | each effective axis independently | each Sticky edge resolves only on its matching effective axis |

The browser may still classify one viewport as a CSS scroll container on both
physical axes because of overflow computed-value coupling. That platform fact does
not change the system owner state in this table.

### Scrollbar presentation matrix

| Presentation   | Scroll mechanics                   | Rendering rule                                                                     | Required fallback                                                                    |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Native/default | Browser-owned on the viewport      | Platform scrollbar; standards-based width, color, and gutter styling may refine it | Ignore unsupported styling and retain native behavior                                |
| Native/hidden  | Browser-owned on the viewport      | Allowed only when another clear affordance and keyboard path expose the overflow   | Restore native presentation in forced colors or when the replacement is unavailable  |
| Custom         | Browser-owned on the same viewport | Track/thumb mirror effective axes and live offsets                                 | Native scrolling, touch, wheel, keyboard, and programmatic APIs remain authoritative |

### Platform support

- The baseline implementation MUST work in every browser supported by Astryx Core
  using `ResizeObserver` and DOM scroll geometry. CSS scroll-state queries are a
  future optimization, not the sole implementation, because
  `scroll-state(scrollable: ...)` remains unavailable in Firefox and Safari at the
  time of this proposal.
- `scrollbar-width`, `scrollbar-color`, and `scrollbar-gutter` are within Astryx's
  browser compatibility window and form the supported native presentation surface.
  Forced-colors and platform scrollbar preferences take precedence over decorative
  matching; unsupported or ignored values still degrade to the platform scrollbar
  without changing ownership or access.
- Browser evidence MUST cover Chromium, Firefox, and real Safari. It MUST include
  classic and overlay scrollbars where available, LTR and RTL, zoom, writing-mode
  changes, hidden-to-visible transitions, async content, nested orthogonal and
  same-axis areas, and effective-state changes while focused.
- Chromium evidence MUST cover two regression-sensitive interactions:
  containment on a non-overflowing candidate after Chrome 144's
  [overscroll behavior change](https://chromestatus.com/feature/5129635997941760),
  and hit testing around transformed/perspective ancestors plus clipped rounded
  descendants represented by [Chromium issue 456164629](https://issues.chromium.org/issues/456164629).

## Current-state impact

- `family:layout-regions` currently defines scrolling as explicit and local:
  LayoutContent and LayoutPanel own `isScrollable`; Layout `height="fill"`
  contains region scrolling, while `height="auto"` lets the page grow. The new
  capability preserves those owners but distinguishes requested scrolling from
  effective per-axis scrolling.
- LayoutContent and LayoutPanel currently use the same root element as landmark,
  themed surface, padded content box, and eager `overflow: auto` viewport. They do
  not expose an inner content root. Direct hook adoption therefore requires an
  explicit Layout decision about an internal observed box and its padding/full-
  bleed semantics; the generic hook must not insert that wrapper silently.
- `family:layout-primitives` currently lets Stack and StackItem expose component-
  specific `overflow: auto`; Grid and Center do not inherit that behavior. This
  proposal does not automatically add scrolling to every layout primitive.
- Popover already makes internal scrolling conditional on measured overflow and
  coalesces open-state observation. DropdownMenu has a separate block-axis helper.
  Carousel has a separate inline-axis helper. These are evidence for the shared
  need, not three acceptable long-term definitions.
- Table, CodeBlock, Carousel, and some examples make scroll wrappers keyboard
  focusable unconditionally. Adoption must review whether each wrapper is always
  expected to overflow or should follow effective state.
- Outline already identifies the nearest effective block scroll ancestor by
  combining computed overflow with live geometry, but it performs a point-in-time
  lookup rather than publishing a reusable live owner.

## Prior-art comparison

| System                            | What it gets right                                                                                            | Boundary for this proposal                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Native CSS overflow               | Browser owns scrolling, input, momentum, and native scrollbar accessibility                                   | Axis computed values are coupled; native Sticky chooses a CSS scroll ancestor even when that conflicts with effective per-axis ownership |
| axe `scrollable-region-focusable` | Requires both measurable overflow and a scroll-capable computed overflow value before testing keyboard access | Snapshot audit, not a live observer or owner registry                                                                                    |
| Radix ScrollArea                  | Owns viewport and real content boxes, observes both, and derives overflow separately per axis                 | Primarily a custom-scrollbar component; does not define shared Sticky, overscroll, or conditional focus policy                           |
| Zag Scroll Area                   | Owns viewport/content structure, tracks each axis, offsets, edges, and resize-driven thumb state              | State-machine component machinery is broader than the minimum reusable Astryx capability                                                 |
| Astryx current helpers            | Popover, menu, Carousel, Table sticky columns, and Outline each prove parts of the model                      | Duplicated axis/tolerance/invalidation behavior and no shared effective-owner context                                                    |

Representative public evidence:

- [axe effective-scroll detection](https://github.com/dequelabs/axe-core/blob/4d306cbb7c456849c6f964444a6a7174d2be502a/lib/core/utils/get-scroll.js)
- [Radix viewport/content structure](https://github.com/radix-ui/primitives/blob/f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae/packages/react/scroll-area/src/scroll-area.tsx#L149-L311)
- [Radix per-axis overflow observation](https://github.com/radix-ui/primitives/blob/f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae/packages/react/scroll-area/src/scroll-area.tsx#L481-L512)
- [Zag viewport/content resize tracking](https://github.com/chakra-ui/zag/blob/a40f3f34a2d8a7899885d20fda112e26a91ae50c/packages/machines/scroll-area/src/scroll-area.machine.ts#L460-L482)
- [CSS overflow computed-value coupling](https://drafts.csswg.org/css-overflow-3/#overflow-properties)
- [CSS scroll-state queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Conditional_rules/Container_scroll-state_queries)
- [Native scrollbar width](https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-width), [color](https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-color), and [gutter](https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-gutter)

## Verification

| Contract         | Verification                                               | Representative states                                                                                                                                                                                        | Mutation or failure expectation                                                                                                                      |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR4          | Unit geometry and computed-style tests plus browser matrix | inline, block, both; fitting, exact fit, >1px overflow; scroll-capable and non-scrollable computed values; horizontal, vertical, and sideways writing modes; LTR and RTL                                     | A declaration or excess geometry alone becomes an owner, an effective axis is missed, or physical direction leaks into the contract                  |
| FR5–FR9          | Observer lifecycle and integration tests                   | viewport resize, content resize, async resource, hidden/show, reconnect, classic scrollbar                                                                                                                   | State remains stale, reports fitting while unmeasurable, loops, or publishes redundant updates                                                       |
| FR10, FR11, FR18 | Real-browser nested Sticky matrix                          | arbitrary flow position; each logical edge; orthogonal and same-axis owners; inactive inner candidate                                                                                                        | Sticky binds to a non-effective or cross-axis owner, cannot appear mid-flow, or stacks against the wrong boundary                                    |
| FR12, FR13       | Keyboard and accessibility-tree tests                      | fit/overflow, named viewport, native link/button delegation, excluded roles, nested owners, forward/reverse entry, pointer/programmatic focus, dynamic eligibility, full Arrow/Page range in Chromium/WebKit | Content is unreachable, a fitting area adds an unexplained stop, an existing path gains a duplicate stop, naming is absent, or focus moves on change |
| FR14             | Wheel/touch/keyboard chaining browser tests                | fitting child, active child, each edge, contain and chain                                                                                                                                                    | A fitting child creates a dead wheel zone or explicit containment leaks to an inactive axis                                                          |
| FR15, FR16       | Native/custom presentation and forced-colors tests         | overlay/classic, thin/default, stable gutter, hidden/replacement, custom thumb                                                                                                                               | Presentation creates a second owner, masks state, loses platform fallback, or changes scrolling mechanics                                            |
| FR17             | Type/API tests and browser fixtures                        | requested inline, block, both; attempted visible opposite axis                                                                                                                                               | Public API admits a CSS combination the platform computes to different semantics                                                                     |
| FR19             | Table browser integration                                  | inline-only, bounded both-axis, sticky columns, sticky headers, intersection cell                                                                                                                            | Table plugins observe different owners or an external wrapper silently breaks sticky/accessibility behavior                                          |
| FR20             | ScrollableArea component and container-padding tests       | zero/default padding, uniform/edge overrides, nested bleed consumer, contained and full-bleed viewport                                                                                                       | Content publishes stale inset, a nested bleed child compensates incorrectly, or scrolling escapes its parent without explicit intent                 |
| FR21             | Real-browser fitting/overflowing Sticky transition         | fitting default, fitting `always`, content growth, content shrink, outer block Sticky owner                                                                                                                  | A fitting default viewport silently captures Sticky, explicit containment is lost, or overflow growth fails to activate scrolling                    |

## Decision log

### DEC-1 — Shared hooks own behavior; ScrollableArea is the reference composition

**Reference:** `spec:AST-025/DEC-1`
**Decider:** `cixzhang`, `2026-09-11`

Shared utility hooks are the canonical owner for effective-axis measurement,
observation, invalidation, and scroll-owner publication. Components with existing
viewport/content structure adopt those hooks directly. `ScrollableArea` composes
the same hooks into a convenience component and demonstrates the complete default
composition; no behavior is available only through that component.

This keeps scroll behavior reusable without forcing structure-owning components such
as Layout regions or Table through a behavior-named wrapper. It also gives builders a
complete default when they do want the system to own the required structure.

Rejected: making `ScrollableArea` the only entry point, because that would require
extra wrappers and turn a behavior component into the owner of component-specific
structure.

### DEC-2 — ScrollableArea is an explicit container-padding participant

**Reference:** `spec:AST-025/DEC-2`
**Decider:** `cixzhang`, `2026-09-11`

The reference component publishes its content box's logical padding, zero by
default, so nested bleed consumers receive the geometry actually applied.
Viewport bleed remains explicit rather than a side effect of becoming scrollable.
This aligns ScrollableArea with the shared container system without making the
behavior hook own padding or layout.

Rejected: automatic parent-padding escape, because adding scrolling must not
silently widen a container's visual boundary.

### DEC-3 — Fitting scroll intent does not silently contain Sticky

**Reference:** `spec:AST-025/DEC-3`
**Decider:** `cixzhang`, `2026-09-12`

The shared hook applies `clip` on both physical axes until requested content
exceeds its geometry. This avoids pre-measure paint overflow without creating a CSS
scroll container, so a fitting area does not silently intercept native Sticky from
an outer owner. Geometry-only overflow state activates the writing-mode-resolved
`auto`/`hidden` pair before effective ownership is measured.

`stickyContainment="always"` is the explicit opt-in for consumers that deliberately
want the fitting viewport to remain a Sticky boundary. Its camelCase enum follows
the public API conventions.

Rejected: retaining `auto`/`hidden` for every requested viewport, because scroll
intent alone would change Sticky behavior even when no scrolling can occur.
Rejected: no overflow declaration while fitting, because content could flash before
the first geometry measurement.

### DEC-4 — Shared automatic keyboard ownership delegates at entry

**Reference:** `spec:AST-025/DEC-4`
**Decider:** `cixzhang`, `2026-09-13`

`keyboardAccess.owner="contentOrViewport"` owns the automatic keyboard path in
one shared hook. Components do not maintain parallel focusability detectors.
The initial continuous-eligibility approach is replaced by focus-time delegation:
the overflowing viewport remains a named stop, and forward Tab entry inspects the
first sequential descendant. The conservative delegation set is native links and
buttons outside composite widgets, editable surfaces, and nested scroll owners.
Positive-tabindex ordering and unproven interactive roles retain the viewport.

Native reverse traversal skips the viewport when returning from the delegated
first child. Pointer/programmatic focus stays on the viewport. Content changes
never move existing focus; eligibility is checked again on the next keyboard
entry. Native scrolling remains responsible for Arrow/Page keys and chaining.

Rejected: continuous keyboard-eligibility scans after subtree and ancestor
mutations, because shared infrastructure should not pay that cost while idle.
Geometry observation remains separate. Also rejected: forwarding past an excluded
first descendant, because that changes the consumer's sequential focus order.

## Open questions

- **OQ1 — How is the Layout `isScrollable` migration observed and sequenced?**
  (`human-api`) LayoutContent and LayoutPanel will migrate their existing
  `isScrollable` path to the shared managed behavior. Because `isScrollable`
  defaults to true, implementation MUST land as a separate change above the shared
  hooks and `ScrollableArea`. Prototype and compare one-element hybrid observation
  (viewport plus direct-child resize, subtree mutation, resource/font, transition,
  and explicit invalidation signals) against an internal observed content box.
  Either path requires compatibility evidence for async and CSS-only geometry
  changes, direct-child selectors, flex/grid children, percentage sizing, full
  bleed, container padding, and refs before it replaces current behavior.
