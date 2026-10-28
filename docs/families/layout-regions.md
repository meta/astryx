---
schema_version: 1
template_version: 1
kind: family
id: family:layout-regions
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-31
owners: [cixzhang, imdreamrunner]
review_triggers: [public-api, behavior, layout, accessibility, theming]
verified_by:
  [
    packages/core/src/Section/Section.test.tsx,
    packages/core/src/Layout/Layout.test.tsx,
    packages/core/src/Layout/LayoutSlots.test.tsx,
    packages/core/src/Layout/__tests__/childrenAsContent.test.tsx,
    packages/core/src/Layout/__tests__/contentWidth.test.tsx,
    packages/core/src/Toolbar/Toolbar.test.tsx,
  ]
members:
  [
    component:Section,
    component:Layout,
    component:LayoutHeader,
    component:LayoutContent,
    component:LayoutFooter,
    component:LayoutPanel,
    component:Toolbar,
  ]
architecture:
  [architecture:container-padding, architecture:public-component-api]
contributing: []
deciding_specs: []
---

# Layout regions contract

## Intent

A page or bounded work area should have predictable structural regions before
its product content is added. Builders can use a generic Section, a five-slot
Layout primitive, or a contextual Toolbar without each surface inventing its
own inset, boundary, region direction, or content ownership. AppShell owns the
page shell that composes these lower-level regions with application navigation.

## Membership rule

A component belongs when its primary public purpose is defining a stable
structural region: a generic page/content region, a named position in Layout's
five-slot topology, or a contextual action region. Members may compose shared
layout primitives, but they own a stronger boundary than arbitrary-child
arrangement alone.

- **Members:** Section; Layout and its Header, Content, Footer, and Panel regions;
  Toolbar.
- **Collaborators:** `family:layout-primitives` supplies arbitrary-child
  arrangement utilities; `architecture:container-padding` supplies the broader
  inset and bleed system used by Section, Layout and its regions, Table, Toolbar,
  and Divider; useResizable and ResizeHandle may drive a panel's size; AppShell
  owns the page shell and composes Layout with application navigation; component
  theming owns visual targets.
- **Excluded:** Stack, Grid, Center, and their modifiers arrange arbitrary
  children without claiming a structural region. FormLayout owns field-specific
  arrangement and optionality. Card is a discrete-item surface. AppShell owns
  page-shell and navigation semantics rather than this reusable region grammar.
  Table owns structured data, and Divider owns separation; their participation
  in `architecture:container-padding` does not make either a layout-region
  member.

A component does not join because it happens to render a flex row, a padded
wrapper, or a header-like visual treatment.

## Shared owner

- Section owns the generic painted page/content region, including its variant,
  selected divider edges, component padding, and nested Section behavior.
- Layout owns its five-slot topology, slot presence, region position, shared
  outer/inner inset, height mode, content-width propagation, and default
  header/footer divider context. It does not own the page shell.
- LayoutHeader, LayoutContent, LayoutFooter, and LayoutPanel own their region
  element, optional landmark role/name, local padding, and region-specific size
  or scrolling behavior.
- Toolbar owns the contextual action region, its start/center/end lanes,
  toolbar semantics, keyboard movement, and size cascade. It delegates its
  painted surface, variant, and selected divider edges to Section.
- `architecture:container-padding` owns inherited inset and bleed mechanics.
- useResizable and ResizeHandle own resize state and interaction. LayoutPanel
  only accepts their current size as an alternative width owner.

## Canonical concepts

| Concept               | Values or states                                                    | Default semantics                                                           | Stability              |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| generic region        | Section                                                             | Related page/content area with an optional painted treatment                | current                |
| five-slot topology    | header, start, content, end, footer                                 | Layout places provided regions in logical reading direction                 | current                |
| contextual actions    | start, optional center, end                                         | Toolbar groups controls within a bounded content region                     | current                |
| outer and inner inset | Layout edge or adjacent-region edge                                 | A Layout region uses the inset appropriate to the edges it touches          | current                |
| boundary              | absent or divider                                                   | A member may draw only the edges its component contract exposes             | current                |
| region scroll         | clipped, scrollable, or page-owned where exposed                    | LayoutContent and LayoutPanel own their current overflow choice             | component-owned        |
| landmark              | no explicit role, or caller-supplied role and label                 | A region does not infer page-level landmark semantics from visual placement | current                |
| region size           | intrinsic, fixed, fill/auto, capped, or resize-driven where exposed | Each member owns its applicable size axis                                   | component-owned        |
| responsive adaptation | retained, omitted, or replaced by caller composition                | No shared automatic region swap exists                                      | caller/component-owned |

## Cross-component invariants

- **FR1 — A region owns structure, not product meaning.** A member establishes a
  spatial boundary and renders caller content without adopting the content's
  product semantics, state, or component contracts. Toolbar's press
  tracking across its buttons (`family:action-groups` FR5) is the one
  exception.
- **FR2 — Region direction is logical.** Start and end follow writing direction.
  Divider placement and panel adjacency use the same logical region position.
- **FR3 — Layout selects geometry from slot presence.** Header, Content, Footer,
  and Panel apply outer inset where they touch the Layout boundary and inner
  inset where they meet another region. LayoutContent keeps its root as the
  scroll, padding, and direct-child owner. Omitted slots do not leave an area
  wrapper. The inherited geometry republished to full-bleed descendants is
  subject to the current LayoutContent/LayoutPanel conformance gap in
  `architecture:container-padding`.
- **FR4 — Explicit region padding replaces the automatic applied inset.**
  Section publishes its component inset; Layout distributes outer and inner
  inset across its named slots; a region's explicit padding or zero-padding
  path selects its local styles. This does not claim that every automatic
  Layout edge currently republishes an exact matching descendant variable.
- **FR5 — Boundary ownership is caller-selected where composition permits two
  owners.** LayoutHeader and LayoutFooter each own their implied edge. Section
  and Toolbar expose selected edges. LayoutPanel may draw its content-facing
  edge, and ResizeHandle may also draw it; current code does not prevent both.
  A resizable panel composition must set `LayoutPanel hasDivider={false}` when
  the adjacent ResizeHandle owns the divider.
- **FR6 — Divider absence may change spacing.** Layout regions currently collapse
  the interior spacing associated with an absent header, footer, or panel
  divider; an explicit divider preserves the fenced boundary.
- **FR7 — Scrolling is explicit and local.** LayoutContent and LayoutPanel own
  their current `isScrollable` behavior. Section and Toolbar do not become
  scroll containers through family membership. Layout `height="fill"` contains
  region scrolling; `height="auto"` lets the containing page grow.
- **FR8 — Landmark semantics remain explicit.** Named visual placement does not
  automatically assign `banner`, `main`, `navigation`, `complementary`, or
  `contentinfo`. A caller supplies a supported role and label for the context.
- **FR9 — Responsive substitution is not automatic.** Section and Toolbar keep
  their current presentation. Layout renders the regions supplied by the
  caller. AppShell, product composition, or another component-specific owner
  decides when a region is omitted or replaced at a narrower width. AppShell
  keeps main content mounted (state preserved) when crossing the mobile
  breakpoint.
- **FR10 — Resize ownership remains delegated.** A LayoutPanel with `resizable`
  uses the hook-provided current size instead of its `width` prop. The region
  family does not redefine snapping, persistence, collapse, keyboard, or pointer
  behavior.
- **FR11 — Theming remains component-owned.** Structural membership does not
  create family targets. Current `.doc.mjs` metadata documents shipped targets
  and capabilities, runtime `themeProps()` emits them, and
  `architecture:component-theming-surface` owns the cross-component rules. A
  component spec may add optional anatomy-mapping metadata when one exists.
- **FR12 — Content width keeps the scrollbar at the open content edge.** When
  `contentWidth` is set without panels, LayoutContent spans the available middle
  area and aligns its direct children through context-aware inline insets. With
  exactly one panel, that panel stays aligned to the centered frame while
  LayoutContent extends through the opposite open side. The mirrored start/end
  cases use the same rule. With both panels, the complete middle composition
  stays constrained. Percentage and intrinsic width values, plus bare variables,
  keep the constrained composition because they cannot safely share one alignment
  basis; `calc(var(...))` is the explicit length-valued variable path.

## Allowed component variation

- **AV1 — Region strength.** Section is a generic region; Layout members are
  position-aware slots in the five-slot primitive; Toolbar is a semantic action
  bar.
- **AV2 — Surface treatment.** Section and Toolbar may use Section variants and
  selected edges. Layout regions use their existing divider and padding
  treatments. Family membership does not unify their visual API.
- **AV3 — Region content.** Header, footer, panel, content, and toolbar lanes may
  hold any content allowed by their component contracts.
- **AV4 — Size model.** Layout owns fill/auto container height and content-width
  propagation; individual regions own applicable height, width, padding, and
  scroll props; Section owns its box-size props.
- **AV5 — Interaction.** Toolbar owns roving focus, keyboard hints, and the
  press tracking `family:action-groups` FR5 gives it across its buttons. Other
  members add no toolbar behavior. Resizable owns resize interaction.
- **AV6 — Composition mechanism.** Members may use Stack utilities, direct CSS
  layout, contexts, or component composition. The observable region contract is
  the owned surface.
- **AV7 — Responsive policy.** Callers may omit, replace, or externally adapt
  regions. The family sets no breakpoint.

## Representative matrix

| Member and state                                 | Shared invariant                                                | Deliberate variation                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Section / default, transparent, or muted         | Owns one generic region and publishes its applied inset         | Variant and selected divider edges are Section-local                                                                              |
| Layout / content only                            | Slot presence selects Layout-edge inset                         | With `contentWidth`, LayoutContent spans the middle area, aligns children internally, and keeps its scrollbar at the Layout edge  |
| Layout / all regions                             | Start/end stay logical; named regions receive outer/inner inset | With exactly one panel, content extends to the opposite open edge; with both panels, the complete composition remains constrained |
| LayoutHeader or LayoutFooter / divider inherited | One boundary owner and explicit landmark semantics              | Parent `defaultHasDividers` supplies the default; local false may override it                                                     |
| LayoutContent / scrollable or page-owned         | Region owns current overflow choice                             | `isScrollable={false}` supports parent/page scrolling and sticky descendants                                                      |
| LayoutPanel / fixed or resize-driven             | Panel position selects edge treatment                           | useResizable may replace width ownership; ResizeHandle retains interaction ownership                                              |
| Toolbar / two or three lanes                     | Contextual action region delegates its surface to Section       | Center content switches internal arrangement; toolbar alone owns keyboard behavior                                                |

## Adoption and exceptions

| Component or concern | Adoption                                                          | Current gap or exception                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section              | Generic region and container-padding publisher                    | Its nested escape is always inline but only first/last child on the block axis                                                                                                                                                                                                                                                                                              |
| Layout container     | Five-slot region owner with slot contexts                         | Content-only LayoutContent stays full width and aligns direct children through insets. With exactly one panel, the panel remains aligned while content extends to the opposite open edge. With both panels or intrinsic content widths, the middle composition stays constrained. Tests cover topology; browser evidence covers mirrored alignment and scrollbar placement. |
| LayoutContent        | Reads slot presence and applies outer/inner inset                 | Its no-start path writes the outer value to both inline geometry variables, while no-end changes padding without the matching variable update                                                                                                                                                                                                                               |
| LayoutPanel          | Applies position-aware padding and may accept resize-driven width | Automatic Layout-edge padding leaves baseline inner geometry variables; an adjacent `ResizeHandle hasDivider` can double the line unless the caller sets panel `hasDivider={false}`                                                                                                                                                                                         |
| LayoutHeader/Footer  | Region-specific inset, boundary, and landmarks                    | Cross-region computed-style parity is not covered by one browser matrix                                                                                                                                                                                                                                                                                                     |
| Toolbar              | Section-backed surface plus toolbar behavior                      | Inline inset and edge compensation follow the composed Section's current padding context                                                                                                                                                                                                                                                                                    |
| Responsive regions   | Caller/AppShell composition                                       | LayoutPanel has no current shared responsive visibility contract                                                                                                                                                                                                                                                                                                            |

These rows describe shipped behavior and verification gaps. They are not approved
exceptions to silently change in a documentation pull request.

## Change coupling

- Adding or changing a structural-region component checks membership and updates
  this contract only when the shared boundary changes.
- Changing Layout slot presence, area context, inset distribution, divider
  inheritance, height mode, or content-width propagation updates the
  corresponding region tests and browser evidence.
- Changing Section padding, nested escape, variant, or divider behavior updates
  its component contract and reviews `architecture:container-padding` when
  inherited geometry changes.
- Changing Toolbar lanes, semantics, keyboard behavior, or size cascade remains
  Toolbar work; changing its Section-backed surface or inset relationship also
  reviews this family and the container-padding architecture.
- Changing LayoutPanel resize integration reviews Resizable's component contract
  without copying resize mechanics into this family.
- Adding responsive hide/swap behavior requires a component or higher-level
  owner and compatibility evidence; family membership does not authorize a new
  breakpoint prop.

## Verification map

| Contract             | Verification                                                     | What the evidence proves                                                                                                                                                                                              | Missing evidence                                                                                                                        |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FR1                  | Section/Layout/Toolbar render and slot tests                     | Caller content renders inside the current region structure; Toolbar exposes its current lanes                                                                                                                         | Tests do not independently prove that product semantics remain caller-owned                                                             |
| FR2                  | Logical-property source review plus Layout area-context tests    | Start/end slots are identified logically and source selects logical divider/padding properties                                                                                                                        | No real-browser LTR/RTL geometry matrix covers every region                                                                             |
| FR3                  | `Layout.test.tsx` and `childrenAsContent.test.tsx`               | Slot presence/context and content precedence are pinned; omitted slots do not render area providers                                                                                                                   | Tests do not assert computed outer/inner inset or exact descendant geometry; the published-variable mismatch is a named conformance gap |
| FR4                  | Section padding class-set tests and Layout region source         | Section's explicit edge overrides move matching variables; region source has automatic, explicit, and zero-padding branches                                                                                           | Layout tests mostly assert acceptance/rendering, not computed padding or automatic-variable parity                                      |
| FR5, FR6             | `Layout.test.tsx` and `LayoutSlots.test.tsx`                     | Header/footer divider defaults and explicit false overrides are reflected in `data-divider`; source contains collapse styles                                                                                          | No rendered test prevents a LayoutPanel and adjacent ResizeHandle from both drawing a divider, or proves computed collapse spacing      |
| FR7                  | LayoutContent/LayoutPanel source and local class/render tests    | The two regions expose their current `isScrollable` branches; Layout exposes fill/auto state                                                                                                                          | No browser test proves scroll ownership across every shell/region composition                                                           |
| FR8                  | `LayoutSlots.test.tsx` landmark assertions                       | Supplied roles and labels reach Header, Content, Footer, and Panel elements                                                                                                                                           | No family-wide accessibility-tree test covers repeated landmarks                                                                        |
| Layout content width | `contentWidth.test.tsx` and Storybook scrollbar-placement states | Header/footer retain aligned wrappers; no-panel LayoutContent owns a full-width scroll region; either single-panel state mirrors content through the opposite open edge; both panels keep the composition constrained | Real-browser evidence verifies computed content alignment and scrollbar placement across the four panel states                          |
| Toolbar variation    | `Toolbar.test.tsx`                                               | Lanes, role/name/orientation, Section variant delegation, and current keyboard behavior have focused assertions                                                                                                       | No computed inset/edge-compensation test covers non-default parent padding                                                              |
| FR10                 | LayoutPanel coverage in `LayoutSlots.test.tsx`                   | Hook-provided `_size` overrides the fixed width prop                                                                                                                                                                  | Resize interaction, persistence, snapping, and collapse are verified only by Resizable's own tests                                      |

The current tests prove selected structure, attributes, callbacks, and class/style
branches. They do not prove one computed visual alignment across every Section,
Layout, Toolbar, and ResizeHandle composition; the adoption table names those
limits explicitly.

## Decision links

### DEC-1 — Structural regions and composition primitives have separate owners

**Decider:** `cixzhang`, `2026-08-30`

Section, Layout and its named regions, and Toolbar form the layout-regions
family. Stack, Grid, Center, and their modifiers have a separate
layout-primitives owner. This keeps shared region rules focused on structural
boundaries without turning every flex/grid container into a page region.

### DEC-2 — AppShell owns the page shell

**Decider:** `cixzhang`, `2026-08-31`

AppShell owns the page shell and application-navigation composition. Layout is
the general five-slot primitive used to arrange `header`, `start`, `content`,
`end`, and `footer` regions within a page or bounded container. The broader
container-padding participants retain their own component ownership.

### DEC-3 — Content-only width alignment stays inside the content scrollport

**Decider:** `cixzhang`, `2026-09-09`

When `contentWidth` is set without panels, LayoutContent spans the available
middle area and aligns its direct children through context-aware inline insets.
With exactly one panel, that panel remains aligned to the centered frame while
LayoutContent extends through the opposite open side. Logical start and end
mirror. With both panels, or when the width is percentage-based, intrinsic, or
an unresolved bare variable and cannot safely share one CSS arithmetic basis, the
complete middle composition stays constrained. A guaranteed length-valued
variable uses `calc(var(...))` to opt into edge scrolling.

## Open questions

None. The adoption table contains checkable source and browser work, not
unresolved family policy.

## Content boundary

This record owns only shared structural-region behavior. It does not repeat
component prop tables, define arbitrary-child composition, own product or
navigation semantics, prescribe visual design, assign responsive breakpoints,
redefine resize interaction, or own component theming anatomy and targets.
