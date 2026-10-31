---
schema_version: 1
template_version: 1
kind: family
id: family:layout-primitives
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, layout, theming]
verified_by:
  [
    packages/core/src/Stack/Stack.test.tsx,
    packages/core/src/Stack/StackItem.test.tsx,
    packages/core/src/Grid/Grid.test.tsx,
    packages/core/src/Center/Center.test.tsx,
  ]
members:
  [
    component:Stack,
    component:HStack,
    component:VStack,
    component:StackItem,
    component:Grid,
    component:GridSpan,
    component:Center,
  ]
architecture:
  [
    architecture:container-padding,
    architecture:public-component-api,
    architecture:component-theming-surface,
  ]
contributing: []
deciding_specs: []
---

# Layout primitives contract

## Intent

Builders should be able to arrange arbitrary content in one or two dimensions,
center it, size its layout box, and express spatial relationships with the same
small vocabulary. Choosing Stack, Grid, or Center changes the arrangement model;
it does not create a second spacing scale or a new meaning for shared prop names.

## Membership rule

A component belongs when its primary public purpose is arranging arbitrary child
content through the shared layout-primitive vocabulary. A modifier belongs with
its parent when it changes one child's participation in that arrangement.

- **Members:** Stack, its HStack and VStack convenience forms, StackItem, Grid,
  GridSpan, and Center.
- **Collaborators:** shared `SpacingStep` and `SizeValue` types; Stack and
  StackItem style utilities; `padding.stylex.ts`; the container-padding
  architecture; component `.doc.mjs` theming metadata and runtime
  `themeProps()` emission.
- **Excluded:** Section, Layout, its named regions, and Toolbar own structural
  region contracts rather than this family's arbitrary-child flow, grid, and
  centering vocabulary. Layout is a general-purpose primitive, but its public
  model is five named slots rather than unrestricted child arrangement.
  FormLayout owns field arrangement and form-level optionality. AspectRatio
  constrains one child's box rather than arranging arbitrary children. Card and
  Dialog are surfaces. AppShell owns the page shell and application navigation
  composition.

Membership follows public responsibility, not implementation mechanism. A
component does not join merely because its source uses flexbox or grid.

## Shared owner

- `SpacingStep` owns the public numeric spacing vocabulary used by member gap
  and padding props.
- `SizeValue` owns the number-as-pixels/string-as-CSS-value contract for member
  box dimensions.
- Stack owns one-dimensional direction, wrapping, and main/cross-axis
  alignment. HStack and VStack are fixed-direction forms of that contract.
- Grid owns fixed and intrinsic/fluid track construction. GridSpan owns one
  child's row and column participation.
- Center owns centering along one or both axes.
- `architecture:container-padding` owns bleed geometry. Applying local padding
  does not by itself publish that protocol.

## Canonical concepts

| Concept            | Values or states                                           | Default semantics                                             | Stability       |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------- | --------------- |
| spacing step       | `0`, `0.5`, `1`, `1.5`, `2`, `3`, `4`, `5`, `6`, `8`, `10` | A token-backed distance for supported gap or padding props    | current         |
| box size           | number or CSS value string                                 | Numbers are pixels; strings pass through as CSS values        | current         |
| flow direction     | horizontal or vertical                                     | Stack defaults to vertical; HStack/VStack fix the direction   | current         |
| alignment          | main/cross axis or physical horizontal/vertical aliases    | The active arrangement model resolves the axis                | current         |
| gap                | uniform, row, or column where supported                    | Space between arranged items, not container inset             | current         |
| padding            | uniform, axis, or logical edge where supported             | Space inside the member's own box                             | current         |
| item participation | intrinsic, fill, self-aligned, column span, or row span    | A modifier changes one child's role in its parent arrangement | current         |
| responsiveness     | intrinsic, wrapping, or consumer-authored                  | Each member documents its own available mechanism             | component-owned |

## Cross-component invariants

- **FR1 — Shared names keep shared value semantics.** A member prop typed as
  `SpacingStep` or `SizeValue` follows the shared value and coercion contract.
  Members expose only the capabilities their arrangement model supports.
- **FR2 — Logical spacing follows writing direction.** Inline start and end are
  logical edges. A member does not reinterpret them as fixed left and right.
- **FR3 — Padding precedence is per edge.** On members with the full padding
  ladder, an explicit edge value wins over its axis value, which wins over
  uniform `padding`; an override changes only that edge.
- **FR4 — Gap and padding stay distinct.** Gap separates arranged items. Padding
  insets content inside a member. Grid's `rowGap` and `columnGap` override its
  uniform gap only on their axis.
- **FR5 — Alignment follows the arrangement model.** Stack resolves main and
  cross axes from direction. Grid aligns items in tracks. Center controls which
  axis or axes are centered. One member does not copy another's props when their
  meanings would differ.
- **FR6 — Modifier components require their parent model.** StackItem controls
  participation in Stack; GridSpan controls participation in Grid. Their
  component contracts own behavior outside the expected parent.
- **FR7 — Responsive behavior is explicit.** Grid may reflow from intrinsic
  track math; Stack wraps only when configured; Center does not create a
  breakpoint. The family does not promise a shared breakpoint or automatic
  region swap.
- **FR8 — Local padding is not a bleed signal.** Stack and Center currently
  apply padding without publishing container inset geometry. Descendants may
  rely on bleed compensation only under a publisher named by
  `architecture:container-padding`.
- **FR9 — The public contract does not prescribe source structure.** Components
  may use member utilities or direct platform layout when their observable API
  and behavior remain correct.

## Allowed component variation

- **AV1 — Arrangement model.** Stack uses one-dimensional flow, Grid uses
  two-dimensional tracks, and Center uses one- or two-axis alignment.
- **AV2 — Available props.** Stack, HStack, VStack, and Center expose the full
  logical-edge padding ladder. Grid exposes axis-specific gaps. Modifier
  components expose parent-specific participation instead of box-level layout
  controls.
- **AV3 — Element ownership.** Stack, HStack, VStack, and StackItem are
  polymorphic. Grid, GridSpan, and Center currently own fixed div elements.
- **AV4 — Overflow.** Stack, HStack, VStack, and StackItem expose their current
  scroll behavior; Grid and Center do not gain it through family membership.
- **AV5 — Responsiveness.** Grid's intrinsic columns, Stack wrapping, and
  consumer-authored responsive styles remain component-specific.
- **AV6 — Implementation.** Raw flex/grid and shared utilities are both allowed.
  Family membership does not create migration debt for implementation-only
  choices.
- **AV7 — Theming.** Current component `.doc.mjs` metadata documents shipped
  targets and capabilities, and runtime `themeProps()` calls emit them.
  `architecture:component-theming-surface` owns the cross-component rules.
  A component spec may add optional anatomy-mapping metadata when one exists;
  this family does not assume or replace such a spec.

## Representative matrix

| Member and state               | Shared invariant                                                    | Deliberate variation                                                                             |
| ------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Stack / vertical or horizontal | Shared spacing and sizing values; direction resolves alignment axes | May wrap, scroll, or render a chosen element                                                     |
| HStack or VStack               | Same Stack contract with a fixed direction                          | Narrower alignment types match the fixed axes                                                    |
| StackItem / `size="fill"`      | One child may consume remaining Stack space                         | `isScrollable` pairs overflow with StackItem's flex minimum reset                                |
| Grid / fixed columns           | Shared size and gap values                                          | Explicit count of `1fr` tracks (`columns={N}`); never reflows; minimum content may widen a track |
| Grid / intrinsic columns       | Shared size and gap values                                          | `{minWidth, max?, repeat?}` constructs fluid tracks that reflow                                  |
| GridSpan / columns or rows     | Modifier participates in Grid                                       | Spans tracks rather than controlling parent geometry                                             |
| Center / one or both axes      | Shared size and padding values                                      | Needs available size on an axis before centering is observable                                   |

## Adoption and exceptions

| Component or concern  | Adoption                             | Current gap or exception                                                             |
| --------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| Stack, HStack, VStack | Shared one-dimensional contract      | Gap token mapping is implemented separately from Grid's mapping                      |
| StackItem             | Shared modifier contract             | No family-wide flex-item grow/shrink/basis vocabulary exists                         |
| Grid, GridSpan        | Shared two-dimensional contract      | No cross-component test proves Grid and Stack resolve equal gap steps equally        |
| Center                | Shared sizing and padding vocabulary | Like Stack, its padding is local and does not publish bleed geometry                 |
| Shared verification   | Per-component unit coverage          | No computed-style matrix proves every shared spacing and sizing value across members |

These are shipped coverage or adoption gaps, not authorization to add props or
change layout behavior in a documentation pull request.

## Change coupling

- Adding or changing a shared spatial prop checks whether its name, value type,
  coercion, logical direction, and precedence still match this family.
- Changing `SpacingStep` or `SizeValue` reviews every member that exposes the
  affected type and updates representative cross-component evidence.
- Changing Stack direction/alignment updates HStack and VStack in the same
  reviewed change.
- Changing intrinsic Grid track construction preserves its documented fixed,
  fill, fit, and capped states with focused tests.
- Enrolling a member in container bleed is a separate
  `architecture:container-padding` change with rendered compatibility evidence.
- A new component joins only when its public responsibility satisfies the
  membership rule; use of flexbox, grid, or a shared utility is insufficient.

## Verification map

| Contract | Verification                                               | What the evidence proves                                                                                                                                | Missing evidence                                                                                                                       |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR3 | Stack and Center source plus their padding class-set tests | The current merge order selects edge over axis over uniform padding for the exercised values, and equivalent spellings emit equal functional class sets | No browser matrix compares computed values across members or both writing directions                                                   |
| FR2      | Logical-property source declarations in Stack and Center   | The implementation uses inline-start/end properties rather than physical left/right properties                                                          | Current tests do not render the padding ladder under both LTR and RTL                                                                  |
| FR4      | Stack/Grid source and their local tests                    | The APIs keep gap separate from padding; Grid accepts uniform and axis gap props                                                                        | Grid's gap/rowGap/columnGap tests assert render success, not computed spacing, and no test compares a step with Stack                  |
| FR5      | Stack, Grid, and Center source plus local render tests     | Each member currently routes alignment through its own arrangement model                                                                                | Stack/Grid tests do not assert computed alignment for the accepted values                                                              |
| FR6      | StackItem and GridSpan source plus local tests             | Source maps `size="fill"` into StackItem's fill style; scrolling changes class output; GridSpan asserts exact inline row/column spans                   | StackItem's fill test asserts only rendered content, not fill behavior; no integration test proves modifiers across every parent state |
| FR7      | Exact Grid track-output tests plus Stack/Center source     | Grid's fixed and intrinsic track strings are pinned; Stack wraps only when configured; Center has no breakpoint path                                    | No cross-member responsive integration matrix exists                                                                                   |
| FR8      | Source review against `architecture:container-padding`     | Stack and Center apply local padding without publishing container inset variables                                                                       | No browser assertion demonstrates the resulting non-bleed behavior for Divider/Table descendants                                       |

The tests are component-local and several assert only render success or class
change. They do not prove computed gap, alignment, logical-direction, or
cross-component parity. Those are named verification gaps, not implied coverage.

## Decision links

### DEC-1 — Composition primitives and structural regions have separate owners

**Decider:** `cixzhang`, `2026-08-30`

Stack, Grid, Center, and their modifiers form the layout-primitives family.
Section, Layout regions, and Toolbar have a separate structural-region owner.
This keeps membership predictive: primitive rules describe arbitrary-child
composition without forcing slot, surface, or toolbar semantics into the same
contract.

## Open questions

None. The adoption table names missing capabilities and verification; it does
not turn them into unresolved family policy.

## Content boundary

This record owns only shared composition vocabulary and behavior. It does not
repeat component prop tables, prescribe implementation mechanisms, define
structural regions, assign responsive breakpoints, or own theming anatomy and
targets.
