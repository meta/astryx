---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:public-component-api
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
owners: [cixzhang, imdreamrunner]
applies_to:
  [
    packages/core/src/,
    packages/core/package.json,
    packages/core/src/BaseProps.ts,
    packages/lab/src/,
    packages/richtext/src/,
    packages/cli/authoring/doctypes/component/,
    internal/eslint-plugin-astryx/,
  ]
verified_by:
  [
    internal/eslint-plugin-astryx/require-base-props.js,
    internal/eslint-plugin-astryx/require-baseprops-passthrough.js,
    packages/core/src/docPropLiterals.test.ts,
    packages/core/src/docPropReferences.test.ts,
  ]
deciding_specs:
  [
    spec:AST-002/DEC-1,
    spec:AST-005/DEC-1,
    spec:AST-012/DEC-1,
    spec:AST-012/DEC-2,
    spec:AST-071/DEC-1,
    spec:AST-017/DEC-23,
    spec:AST-012/DEC-6,
    spec:AST-107/DEC-2,
    spec:AST-107/DEC-3,
  ]
---

# Public component API

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "public-api": [
      "INV1",
      "INV2",
      "INV3",
      "INV4",
      "INV5",
      "INV6",
      "INV7",
      "INV8",
      "INV9",
      "INV12",
      "INV16",
      "INV24",
      "INV25"
    ]
  }
}
```

This record defines the shared public API contract for stable Astryx components.

## Purpose

Consumers should be able to predict how an Astryx component is imported,
controlled, extended, and composed without learning its internal implementation.
New API should express caller-owned intent and preserve established behavior.

## System model

The installable package is the public contract. It includes:

- exported components and hooks;
- exported props and stable supporting types;
- published component subpaths;
- documented defaults; and
- behavior consumers can observe.

Consumer `.doc.mjs` files explain that contract. They do not create props or
policy that the exported code does not have.

Once this record is `current`, every current component contract lists
`architecture:public-component-api` in its `architecture` links. Draft component
contracts add that link only after this record becomes current, so candidate
relationships do not create authority early.

Component and family contracts own narrower behavior. Theme records own theme
targets, public theme properties, tokens, and generated styles. Contribution
guidance owns the process used to propose and test APIs.

## Boundaries and invariants

- **INV1 — Public exports are reachable.** A stable component, hook, prop type,
  and other promised public types are available from their published package
  entry point or component subpath.
- **INV2 — Names carry the same meaning.** Components, hooks, booleans,
  callbacks, Actions, directions, refs, and native HTML pass-throughs follow the
  shared naming grammar. Component-specific vocabulary stays local. A prop that
  chooses how a component responds to input is named `<thing>Behavior` and takes
  a closed union of behavior names, and its name holds no input word (press,
  touch, tap, hover, mouse, click) when the values can name the behavior. A
  public prop names a system primitive with the system's existing vocabulary:
  it introduces no new term for a concept the system already names (DEC-1). A
  gap between an element and its anchor is an `offset`, as `useLayer`'s
  `offset` is; a distance a positioned element keeps in from a container's or
  the viewport's edge is an `inset`, as LayerProvider's and ToastViewport's
  `inset` are. Depth is
  `elevation`, which takes values from `Elevation`, as Card, Button, and Banner
  take it. `lift` names motion under a press, such as
  Switch's thumb lift, Slider's `springs.sliderLift`, and ContextMenu's
  `springs.contextMenuLift`, so it does not name a layout distance. An element
  ref a hook takes is named for the element's job, as `containerRef`,
  `scrollRef`, `menuRef`, `triggerRef`, and `inputRef` are, or `ref` when the element has
  no narrower job.
- **INV3 — One prop controls one independent concept.** A prop does not silently
  suppress an unrelated prop. A parent does not duplicate state already owned by
  a composed child. One interaction behavior is one prop, never parallel touch,
  mouse, or focus props: when the behavior differs by device, that prop offers
  an adaptive value that resolves per device beside explicit fixed values, named
  `'adaptive'` when it has one device resolution and `'adaptive-<target>'` when
  it has several, as `presentation` does (`spec:AST-043/DEC-1`,
  `component:DropdownMenuSubMenu`); a new behavior prop defaults to the shipped
  behavior, which is the adaptive value when the shipped behavior already
  differs by device, and an existing prop's default moves only under INV16 and
  INV9. An `is…` or `has…` boolean names only a true on/off that has no
  third state, and `presentation` names which surface appears and, under INV16,
  the input mode of an open surface.
- **INV4 — New props express caller-owned intent.** New public props follow
  `spec:AST-002/DEC-1`. A component keeps a decision internal when it can derive
  the correct result from state, content, layout, context, or platform behavior.
- **INV5 — Accepted consumer props are preserved.** For a DOM-owning component,
  supported DOM, data, ARIA, style, class, and event inputs reach the element that
  owns the contract. Component-owned accessibility and behavior cannot be
  accidentally overwritten.
- **INV6 — Styling inputs combine.** `xstyle`, `className`, and `style` compose in
  their documented order instead of replacing one another. A family record may
  declare an exception to root styling inputs for its members, stating the
  replacement part inputs and its reason in a decision; `family:input-fields`
  FR10 is one.
- **INV7 — Event handlers compose deliberately.** Consumer handlers and built-in
  behavior use the shared cancellation contract. A consumer can cancel built-in
  behavior only where that public API promises cancellation. A component that
  moves a handler to another element keeps the order and cancellation it
  released for that handler and documents it (`family:input-fields` DEC-8).
- **INV8 — Refs follow React 19.** A public DOM component accepts `ref` as a prop
  and connects it to the element promised by its contract.
- **INV9 — Released APIs change deliberately.** A released prop, type, export,
  default, or observable behavior is not removed, renamed, retyped, deprecated, or
  corrected incompatibly without the lifecycle, evidence, and migration required by
  [`spec:AST-017`](../specs/AST-017/spec.md).
- **INV10 — Shared subcontracts are linked, not copied.** Input Actions, layer
  behavior, theming, and family-specific rules stay with their owning records.
- **INV11 — Public theme seams pass API admission.** A public semantic CSS custom
  property is admitted only for caller-owned intent that the target's guaranteed
  CSS property set cannot express. Its theming record owns the exact purpose,
  stable default/fallback, scope, documentation, evidence, and compatibility
  contract; an internal styling gap alone does not justify public API.
- **INV12 — Reachability outranks internal labels.** A type, context member, hook
  return, utility signature, default, or operation reachable from a supported
  package path is public even when its source comment, filename, or current use
  calls it internal. Privacy requires removing the export or moving the capability
  behind a non-exported boundary. Core's `./internal/*` subpaths are the one
  exception: reachable, but reserved for Core and Lab, undocumented, versioned
  in lockstep with Core, limited by lint to those two packages, and imported
  by a swizzled copy only for an exported StyleX module whose identity is its
  path (`spec:AST-110` FR1), and outside
  the compatibility promise (`spec:AST-017` FR21).
- **INV13 — Public deltas route to their authority owner.** Every public API update
  and every public behavior change follows the result and disposition defined by
  `architecture:knowledge-contracts`. Tests, a Changeset, or a generated manifest
  are evidence; none can settle an absent or contradictory contract.
- **INV14 — Shared breakpoint names keep one meaning.** Components that accept a
  theme width point use `sm`/`md`/`lg`/`xl`/`2xl` from the active Theme. A
  `below` boundary is exclusive, so equality belongs to the wider side.
- **INV15 — A part's styling inputs come as a set.** Styling for an element other
  than the root is accepted as `<part>Xstyle`, `<part>ClassName`, and
  `<part>Style` together, reaching that element and composing as INV6 describes.
  No public prop accepts StyleX styles for an element that cannot also take a
  class name and inline styles, following `spec:AST-071/DEC-1`.
- **INV16 — A caller's presentation choice wins over touch defaults.** A stable
  component that, under a coarse pointer, presents a different surface, such as
  a sheet in place of a popover, or switches how an open surface follows input,
  such as touch tracking in an open list, takes one `presentation` prop, and a
  value of it, such as `presentation="popover"`, keeps the surface and input
  mode the component uses with a fine pointer on every device. Touch behavior
  is the component's default where it serves touch users, and a caller's
  explicit choice always wins over that default. Every internal touch mode of
  that kind is reachable by callers through a public prop or value; none is
  hard-coded beyond a caller's reach. Touch styling, such as press paint or a
  text-size floor, and touch-only behavior that its own record defines, such as
  a row swipe or a tooltip's touch trigger, follow those records. Thresholds and
  tuning values inside a mode stay internal (`spec:AST-002` FR3). INV4 lets the
  component derive the default; INV16 keeps the caller able to override it.
  When a touch default changes a released component's behavior, that
  `presentation` value is the restoring prop `spec:AST-017` FR3 names
  (`spec:AST-017/DEC-23`).
- **INV17 — Compact has one shared definition.** A component that chooses a
  presentation by screen size uses the theme's compact definition: width below
  the effective `md` point or height below 500, with the same numbers on every
  platform (`spec:AST-012` FR9). It keeps no compact numbers of its own, as
  INV14 keeps no parallel breakpoint table. A layout width the caller picks,
  such as AppShell's `mobileNav.breakpoint`, follows INV14 instead.
- **INV18 — Compose along the anatomy.** Avoid props that reach deep into a component's anatomy (e.g.
  picking a specific prop or label of a subcomponent). Build compositions
  instead. Compositions must follow the component's anatomy; never expose a way
  to compose or render a slot not described in the anatomy; and slots must have
  components. Config objects are fine: plain data that describes actions or options (for example the `{label, icon, onActivate}` entries passed to `createSwipe`) is not a slot. 'Slots must have components' applies to rendered content slots, places that accept arbitrary nodes; such a slot must be a part named in the component's anatomy, and the caller fills it with a component. This extends INV3's rule that a parent does not duplicate a
  composed child's state; a slot's styling follows INV15 and
  `architecture:component-theming-surface`. See
  [Slots and composition](../contributing/api-conventions.md#slots-and-composition).
- **INV19 — Resource cost is weighed against the feature.** Balance resource load against feature
  functionality and cross-platform concerns. If a feature has a large resource
  cost, consider plugging the behavior in, as `Item`'s swipe actions plug in
  through `swipe={createSwipe(…)}` (`spec:AST-057` DEC-8). Named props for features are also
  fine (like `collapsible`).
- **INV20 — Variants, not visual booleans.** Avoid boolean flags that only swap visuals; prefer variants. This
  applies INV2's naming and INV4's caller-owned intent to visual choices; see
  [Open visual vocabularies and closed axes](../contributing/api-conventions.md#open-visual-vocabularies-and-closed-axes).
- **INV21 — One API per job.** No new API that shares a job with existing API,
  unless the existing API is being deprecated in favor of it. INV3 keeps one
  prop to one concept and INV16 keeps one `presentation` prop for a surface
  choice; INV21 applies the same rule across props, components, hooks, and
  factories. A hook that delegates entirely to a public factory, with no
  behavior of its own, and a component built entirely on a public factory are
  one API with that factory, not a second one (`spec:AST-107` FR6, FR8). A
  deprecation follows INV9. A hook whose value a component takes through one
  slot prop is one API with that component, not a second one, as in `const value
= useX(…); <Component x={value} />` (owner decision, 2026-11-04).
- **INV21a — Shipped APIs change only for user value.** A breaking or
  deprecating change to a shipped public API needs user value; conformance to a
  system rule alone does not justify it. New APIs follow the current rules;
  shipped APIs are grandfathered until a real need arises (owner decision,
  2026-11-04). Each component API change still needs its own owner approval.
- **INV22 — Interaction utilities have non-React equivalents.** Interaction
  utilities have non-React equivalents (`create…`) that closely match their
  hooks (the same option names and meanings, events and return concepts). A hook
  whose result only an Astryx component or StyleX can use (a slot hook, whose
  output feeds one Astryx component prop, or `useAnimatedLayout`,
  `useEntryAnimation`, `useContainerReveal`, `useTouchTrigger`,
  `useTableRowExpansion`, `useTableColumnResize`) has none by default; the owner
  may add one (owner decision, 2026-11-04). `useMenuPress` has no non-React
  equivalent by owner decision (2026-11-04); one may be added when a caller
  needs it.
- **INV23 — Each private data attribute has one owner module.** A
  `data-astryx-*` attribute is private unless this invariant names it public.
  Each private attribute has one internal owner module in the package that
  writes it, `packages/<package>/src/privateAttributes/<name>.stylex.ts`, that
  holds its name and values and writes each selector on it once, as a literal in
  its own `stylex.create` call; StyleX resolves a selector only where it is
  written. The owner exports only ready-made styles that read the attribute, the
  props or writer that set it, and the runtime readers its package needs, such
  as a `closest` or `matches` helper or a getter; it never exports the raw name
  or a selector. A plain-TS owner,
  `packages/core/src/privateAttributes/<name>.ts`, may export its name and
  selector text to its `.stylex.ts` sibling and to the theme engine in
  `packages/core/src/theme/`; no other file imports it, and `.stylex.ts` owners
  still never export them. When a plain-TS owner exists, its `.stylex.ts`
  sibling is not an owner: it writes the attribute's selectors only as literals
  for its own `stylex.create` calls, because StyleX resolves a selector only
  where it is written, and it never exports them or sets the attribute. Every
  other file in that package spreads those exports and
  never writes the attribute or its selector, and no package imports another
  package's owner module through an internal path. An owner module whose
  attribute marks an element its package does not render may write its
  selector once in an injected rule instead of `stylex.create`; Core may
  re-export only that module's writer to Lab through an internal entry, and
  the attribute name and selector stay private to the owner. StyleX merges styles one
  whole property at a time, so an owner style carries every condition of each
  property it sets, its rest state and pointer states included, and a caller
  does not set those properties again on the same element. Outside the owner
  modules and test files, a hand-typed `data-astryx-` string, template, or JSX
  attribute name, or a `dataAttr()` call that names a private attribute, fails
  the `@astryx/no-raw-private-attribute` lint rule; sites that predate the rule
  sit in its baseline, which only shrinks. Tests may name a private attribute,
  because they assert the DOM a component renders. A private attribute appears
  in no public export, `.doc.mjs`, or Changeset, carries no compatibility
  promise, and may change in any release. A data attribute outside the
  `data-astryx-*` namespace is public too, and is added only when a current
  record names it (DEC-2). The public `data-astryx-*` attributes are
  `data-astryx-theme`, the theme scope (`spec:AST-066` FR6);
  `data-astryx-media`, the media-surface scope that theme compilation emits;
  `data-astryx-aspect-ratio-override` (`component:AspectRatio` FR3);
  `data-astryx-token` and `data-astryx-token-value`
  (`component:ChatComposerTokenElement` FR1); `data-astryx-menu-press`, the
  menu-root marker (`module:DropdownMenu/useMenuPress`);
  `data-astryx-pressable`, the press marker (`component:SegmentedControlItem`
  FR7); and `data-astryx-edge-comp`, exported as `EDGE_COMP_ATTR` (INV12). They
  change only under INV9. The code that owns them writes them at its own sites,
  among them Theme, MediaTheme, `reset.css`, `generateThemeRules.ts`, the CLI
  theme build, AspectRatio, the Chat composer, the press and menu-press hooks,
  and the edge-compensation styles, and the lint rule allows their names.
- **INV24 — Each pull request carries a generated public API delta.** No package
  commits a generated API report. For a pull request that changes a published
  package's source or build, CI runs one surface generator on the merge base and
  on the exact head, from each published package's built declarations and
  stylesheet by entry point, and writes the API changes between them,
  uncommitted, as CI's API-changes artifact. The delta lists new, changed, and
  removed exports, component props with their types, hooks with their
  signatures, supporting types, public CSS custom properties and theme targets,
  the public `data-astryx-*` attributes INV23 names, and public events, each row
  with its signature. A reachable member tagged internal appears (INV12); Core's
  `./internal/*` subpaths and unpublished packages, including Lab, do not. A
  member inside a canonical experimental boundary appears marked experimental
  (`spec:AST-017` FR21). The merge gate reads that artifact only for a pull
  request that changes a published package's source or build, and fails closed
  when it is missing or the generator errors. For any other pull request the
  gate reads no artifact, and its review notes say "New public API: none". The
  review bot's review of each pull request starts its summary notes with the
  delta, each row with a usage example, or says "New public API: none";
  public-API review reads that delta. The delta's rows are evidence and decide
  no acceptance (INV13).
- **INV25 — Undeclared public API goes to a human.** Public-API review
  compares each added or changed row of the pull request's API delta (INV24)
  with current records. A row
  that a record current at the merge base, or a record change in the same pull
  request, decides needs no further step. A row that no current record decides,
  including a reachable member tagged internal, goes to human review with that
  row listed, for an owner of this record, as `architecture:knowledge-contracts`
  change coupling step 6 describes. A removed or renamed row follows INV9.

This record applies to stable public packages, and INV23 also applies to Lab
source. Lab components are not stable public promises until promotion.

## Change coupling

- Adding or changing an exported prop, supporting type, context member, hook
  return, operation signature, default, package entry point, ref target, or
  intentional observable contract triggers public-API review. A top-level export
  need not change for a reachable supporting contract to change.
- Each review compares declarations and reachable exports from merge-base to head
  and from current main to the synthetic merge. The pull request's API delta
  (INV24) inventories that evidence and maps each row to its canonical
  component, family, architecture, or system owner; it does not decide
  acceptance.
- A pull request that changes a published package's public surface shows the
  change in its API delta (INV24) and commits no generated report.
- After the generated surface inventory identifies the exact API and behavior
  delta and its canonical owner, route it under
  `architecture:knowledge-contracts`. This record does not redefine review results
  or PR disposition.
- Consumer docs change when consumer usage or a documented promise changes, or
  when the existing docs would otherwise become false. Fixing an implementation
  defect does not by itself require consumer-doc changes.
- A new prop includes the admission argument from `spec:AST-002/DEC-1`; it does
  not get accepted only because it solves one callsite.
- Public-API review rejects a public prop that names an existing system concept
  with a new term (INV2, DEC-1); the prop takes the system's word for that
  concept.
- Adding a touch presentation or a touch input mode for an open surface to a
  stable component checks INV16: a `presentation` value keeps the fine-pointer
  surface and mode, and every such touch mode is reachable by callers.
- A new public semantic CSS custom property includes the same admission argument
  and shows why the target's guaranteed CSS property set cannot express the
  caller-owned need. Its detailed contract and evidence stay in the owning
  theming/component records.
- A released breaking change includes the compatibility decision and migration
  evidence required by the release process.
- A component exposing a named theme width point uses the fixed vocabulary and
  exclusive upper-edge behavior from `spec:AST-012`; it does not maintain a
  parallel hardcoded breakpoint table. A component that chooses a presentation
  by screen size uses the compact definition (INV17).
- Changes to a family-owned API update the family contract rather than copying
  its rule into this record or every component.
- A component that accepts or derives a navigation destination follows
  `family:navigation-destinations`. Adding a new sink or destination-bearing
  component updates that family rather than creating a component-local URL rule.

## Owning code

- Public package manifests and component barrels own reachable exports.
- Component prop/type definitions and runtime behavior own the actual API.
- `BaseProps` defines the shared DOM/styling surface for DOM-owning components.
- `.doc.mjs` files own consumer-facing prop descriptions, defaults, and examples.
- Astryx ESLint rules and API/doc tests check the shared contract.

## Deciding specs

- `spec:AST-002/DEC-1` — a new public prop requires caller-owned information the
  component cannot derive.
- `spec:AST-005/DEC-1` — every Astryx-owned navigation exit follows one
  destination-safety decision.
- `spec:AST-012/DEC-1` and `spec:AST-012/DEC-2` — components reuse the fixed
  theme width names and inclusive-`from`/exclusive-`below` edge meanings.
- `spec:AST-071/DEC-1` — every styling input works from every styling system,
  so a part's styling inputs come as a set.
- `spec:AST-107/DEC-2` and `spec:AST-107/DEC-3` — a hook over a public
  factory, and a component built entirely on one, are one API with it (INV21).
- `spec:AST-017/DEC-23` — a touch presentation or open-surface touch mode is
  a default the caller can always override, through one `presentation` prop
  that also restores the previous surface and mode.
- `spec:AST-012/DEC-6` — compact is one definition, the same on every platform.

Transition Action sequencing and pending behavior belong to their component or
family contract. This record links that owner once it is current; it does not
copy the component matrix.

### DEC-1 — Public props use the system's existing vocabulary

**Decider:** `cixzhang`, `2026-11-03`

A public prop that names a system primitive uses the word the system already
has for it, so a builder who knows one component reads the same concept the
same way on the next. A gap from an anchor is `offset`, a distance a
positioned element keeps in from an edge is `inset`, depth is `elevation`, and
`lift` stays the name of motion under a press. An API for a new component, such as a search field, starts from
the existing patterns in the system and introduces no new term for a concept
the system already names.

Rejected: component-local names for shared concepts.

### DEC-2 — A data attribute outside the private `data-astryx-*` namespace is public surface

**Reference:** `architecture:public-component-api/DEC-2`
**Decider:** `cixzhang`, `2026-11-09`

The owner said: "New data attributes are public facing and shoudln't be used
for internal only concerns without a clear spec that by passes this rule", and
"main reason to be careful of data attributes is we generate them for themes".
Theme compilation writes selectors on data attributes (the `data-astryx-*`
scopes and attributes that mirror props, such as `data-size` and
`data-variant`), so a data attribute a component renders can be read or
targeted by a theme and becomes public surface. A component therefore adds a
new data attribute only when a current record names it and states why; an
internal-only concern uses a private `data-astryx-*` attribute under INV23 or no
attribute at all.

For a per-instance dynamic style, the first choice is a StyleX dynamic style
(`stylex.create` with a function): it sets a generated custom property inline
on that instance (`--x-<property>`, or a hashed name under a pseudo-element or
condition). That property is private by this rule: no theme value, record, or
document names it, and it may change in any release. The owner said, on
Avatar's initials: "We should make this the agent's first choice for these
types of dynamic styles."

Rejected: adding a data attribute for an internal concern without a record
that names it.

### DEC-6 — Pull requests carry an API delta, not a committed report

**Decider:** `cixzhang`, `2026-11-09`

The owner said: "okay let's get rid of this massive file. We don't need it, we shoudl be generating API deltas agentically for every PR with codebunny". A committed report per package is large, repeats the surface in each package, and goes stale; a delta generated for each pull request flags the change where review happens. CI's surface compare of the merge base and the exact head is the machine source the merge gate reads; it fails closed when a pull request that changes a published package lacks the artifact; for any other pull request it reads none. The review bot's delta at the start of its summary notes is the human view (INV24).

Rejected: keeping a committed generated API report per package.

## Verification

| Invariant               | Evidence                                                                                                                 | Failure signal                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1, INV8              | Export, public-subpath, prop, and ref checks                                                                             | A promised component/type cannot be imported or its ref cannot reach the contract element                                                                                                                                                                                                                                                                                                                                                                                               |
| INV2                    | Naming and logical-direction lint/tests                                                                                  | Equivalent concepts use conflicting names or physical direction leaks into public API                                                                                                                                                                                                                                                                                                                                                                                                   |
| INV2, DEC-1             | Public-API review against the system vocabulary                                                                          | A public prop names a concept the system already names, such as a distance, depth, or press motion, with a new term, or uses `lift` for a layout distance                                                                                                                                                                                                                                                                                                                               |
| INV3, INV4              | Historical API review benchmark and `spec:AST-002` evidence                                                              | A prop combines unrelated axes or exposes a derivable implementation choice; a new interaction-behavior prop that is not a `<thing>Behavior` closed union, carries an input word where its values can name the behavior, splits one behavior across per-input props, or, as a new prop, defaults to anything but the shipped behavior                                                                                                                                                   |
| INV5, INV6, INV7        | BaseProps/passthrough lint and representative runtime tests                                                              | Consumer ARIA/data/style/events are dropped, clobber component semantics, or fail to compose                                                                                                                                                                                                                                                                                                                                                                                            |
| INV9                    | Published-surface, Changeset, migration, and public-type checks                                                          | A released API changes without explicit compatibility evidence                                                                                                                                                                                                                                                                                                                                                                                                                          |
| INV11                   | Public-API admission review plus owning theming/component tests                                                          | A public semantic custom property exposes derivable or unsupported implementation detail                                                                                                                                                                                                                                                                                                                                                                                                |
| INV12, INV13            | Generated declaration/export/behavior inventory plus canonical-owner mapping                                             | A reachable supporting type or behavior outside `./internal/*` is called internal, or mechanical evidence is treated as permission to accept it                                                                                                                                                                                                                                                                                                                                         |
| INV14                   | `AppShell.test.tsx`                                                                                                      | A component hardcodes a divergent point or treats equality as below                                                                                                                                                                                                                                                                                                                                                                                                                     |
| INV15                   | Public-API review of the generated declaration inventory                                                                 | A part or StyleX-typed styling prop ships without class-name and inline-style counterparts on the same element                                                                                                                                                                                                                                                                                                                                                                          |
| INV16                   | Public-API review of touch presentations plus coarse- and fine-pointer runtime tests                                     | A stable component that presents a different surface or switches an open surface's input mode under a coarse pointer and has no `presentation` value that keeps its fine-pointer surface and mode; such a touch mode callers cannot reach; a default that overrides an explicit caller choice                                                                                                                                                                                           |
| INV17                   | Resolver tests at the compact edges plus public-API review                                                               | A component that chooses a presentation by screen size with its own numbers, or disagrees with the theme compact definition at width 768 or height 500                                                                                                                                                                                                                                                                                                                                  |
| INV18                   | Public-API review against the component's anatomy table                                                                  | A prop that selects or configures a subcomponent's prop or label, a composition that renders a slot the anatomy does not describe, or a rendered content slot that is not a part named in the anatomy                                                                                                                                                                                                                                                                                   |
| INV19                   | Public-API review with a bundle and runtime cost note for a costly feature                                               | A feature with a large resource cost that every caller pays with no plug-in path or named feature prop                                                                                                                                                                                                                                                                                                                                                                                  |
| INV20                   | Public-API review of new boolean props                                                                                   | A boolean whose only effect is a visual swap where a variant fits                                                                                                                                                                                                                                                                                                                                                                                                                       |
| INV21                   | Public-API review against existing props, components, hooks, and factories                                               | A new API that shares a job with an existing one that is not being deprecated in its favor; a hook fed to one component slot prop counted as a second API                                                                                                                                                                                                                                                                                                                               |
| INV21a                  | Public-API review of each breaking or deprecating change to a shipped API                                                | A breaking or deprecating change to a shipped public API justified only by conformance to a system rule                                                                                                                                                                                                                                                                                                                                                                                 |
| INV22                   | Public-API review of each public interaction utility hook against its `create…` equivalent                               | An interaction utility hook with no `create…` equivalent, outside hooks whose result only an Astryx component or StyleX can use and `useMenuPress` (by owner decision), or an equivalent whose option names and meanings, events, or return concepts differ from its hook                                                                                                                                                                                                               |
| INV23                   | `@astryx/no-raw-private-attribute` lint with its baseline (test files exempt), plus public-API review of the public list | A `data-astryx-*` name or selector written outside its owner module, a test, or the public list; a `dataAttr()` call that names a private attribute; an owner module that exports its raw name or a selector; a package that imports another package's owner module; a caller that sets a property an owner style it spreads also sets; a private attribute in a public export, `.doc.mjs`, or Changeset; a baseline entry added; a public data attribute changed without INV9 evidence |
| INV24                   | Generator tests, CI's merge-base-to-head surface compare, and the review bot's per-PR API delta                          | A promised export, prop, hook, type, custom property, theme target, public attribute, or event is missing from the delta; a reachable internal-tagged member is missing; an `./internal/*` or Lab member appears; the merge gate passes a pull request that changes a published package when the compare artifact is missing or the generator errors; the review bot's summary notes do not start with the delta or "New public API: none"; a delta row decides acceptance              |
| INV25                   | Public-API review routing against the pull request's API delta                                                           | A row that no current record decides does not reach human review; a row a current record decides is held for a human; an undeclared row alone draws a request for changes                                                                                                                                                                                                                                                                                                               |
| Consumer-doc projection | `docPropReferences.test.ts` and `docPropLiterals.test.ts`                                                                | Docs name a nonexistent prop or omit public literal choices                                                                                                                                                                                                                                                                                                                                                                                                                             |

Known verification gaps:

- INV23 gap: nothing checks data attributes outside `data-astryx-*` yet; the
  lint and its verification row see only `data-astryx-*` names, and existing
  attributes outside that namespace, such as ToastViewport's `data-toast-id`,
  have no inventory.
- INV2, INV3: shipped props that predate the behavior-prop rule keep their
  names until a minor renames them under INV9. This list is a partial
  inventory; known deviations include Tooltip and HoverCard `focusTrigger`,
  `touchTrigger`, and `hasHoverIndication`, and Text and Heading
  `hasTruncateTooltip`, the last two taking more than two states; Dialog and
  AlertDialog `isInline`; CheckboxListItem `isChecked`; `useTableTreeData`
  `isAllExpanded`; hook forms such as `usePopover` `hasLightDismiss`; Tooltip, HoverCard, and Popover `isEnabled`; Overlay `showOn`;
  Thumbnail `showRemoveOn`; Popover `hasLightDismiss`, `hasEscapeDismiss`, and
  `isModal`; Dialog, Drawer, and BottomSheet `purpose`; Banner `isDismissable`;
  Drawer, BottomSheet, and BottomSheetSwitcher `hasScrim`; CommandPalette
  `isInline`; Carousel `hasLoop` and `useListFocus` `wrap`; NumberInput
  `isWheelEnabled`; Outline `hasScrollOnClick`; `useTableRowExpansion` and
  `useTableTreeData` `hasRowClickExpansion`; `useTableSortable`
  `isMultiSortEnabled` and `allowUnsortedState`; Banner, SideNav, SideNavItem,
  and `useResizable` `collapsible` and CodeBlock `isCollapsible`; Calendar
  `mode` and FileInput `isMultiple`; FileInput `mode`; Tokenizer and
  PowerSearch `tokenOverflowBehavior`; OverflowList `behavior`.
- INV2: a shipped prop that names a concept with a word the system uses for
  another keeps its name until a minor renames it under INV9. Outline's
  `offset` is the distance below the top of its scroll root
  (`component:Outline` FR4), not a gap from an anchor.
- INV3: Carousel `hasSnap` takes `boolean | SnapPaging`. Omitted or `false` does
  not snap, `true` is native scroll snap, and a value from `useSnapPaging` is
  snap paging. It is a known deviation from three rules: an `is…` or `has…`
  boolean names only a true on/off with no third state (INV3); a prop that
  chooses how a component responds to input is a `<thing>Behavior` closed union
  (INV2); and a behavior that differs by device offers a per-device value
  (INV3), where the paging value pages under a finger and a trackpad swipe and
  keeps native snap under a mouse wheel. It keeps one snap prop for builders
  (`component:Carousel/DEC-2`) and is not renamed.
- INV22: known gaps include `useLongPress`, `usePressFeedback`,
  `useClickableContainer`, `useInputContainer`, `useOverlay`, `useCombobox`,
  `useMultiCombobox`, `useResizable`, `useTooltip`, `useHoverCard`, and
  `useChatStreamScroll`: each attaches gesture, press, drag, or motion behavior
  and has no `create…` factory yet; no full inventory exists yet. Each conforms
  by adding its factory; a shipped hook's signature changes only when a real
  need arises (INV21a).
- The passthrough lint is warning-only while known violations remain.
- The current source-to-doc completeness matcher still looks for old prefixed
  props interfaces, so it does not yet prove full prop coverage.
- INV24: the delta covers declarations, CSS custom properties, theme targets,
  and public attributes; context-member behavior, undeclared defaults, CLI
  schemas, and observable behavior for both the branch and synthetic merge
  still need explicit review.
- INV24 gap: the review recipe's API delta has no fixture test yet, and no
  repository test covers the merge gate's fail-closed read of the compare
  artifact.
- INV18: shipped content slots that their anatomy does not name yet include
  PowerSearch's `startIcon` and `endContent`, SideNav's `topContent`,
  `footer`, and `footerIcons`, Tokenizer's `startIcon`, DropdownMenu's
  `header` and `footer`, and the picker option's `action`; no full inventory
  exists yet. Each conforms by naming the part, with no API change.
- INV18: shipped props that configure a subcomponent's label or target, such
  as TopNavMegaMenuFeaturedCard's `linkLabel` and `linkHref` and
  TopNavHeading's `logoLabel`, conform only through replacement under INV9.
- INV23: the `@astryx/no-raw-private-attribute` rule runs with a baseline of
  the sites that predate it, and no owner module exists yet; public-API review
  covers what the rule cannot see: Changesets, component `.doc.mjs` files (the
  lint does not reach them), and names assembled from the namespace with `+` or reached in a template
  through anything but `dataAttrNamespace` or `NAMESPACE` (a member access, an
  aliased import, `classPrefix`), and names read or written through
  `element.dataset`. The `data-astryx-press` selector is copied in 14 Core files.
  Other private attributes still written at their sites include
  `data-astryx-popover-fallback-close` and DropdownMenu's
  `data-astryx-submenu-regions`, which Popover and DropdownMenuSubMenu also read
  at runtime; `data-astryx-table-pinned` and `data-astryx-cell-gliding`, each
  named in two files; `data-astryx-scrolling`, read but never written;
  DropdownMenu's `data-astryx-submenu-host`; the Chat composer's
  `data-astryx-dictation-interim`; and RichText's
  `data-astryx-richtext-code-syntax`. No full inventory exists yet. Each
  conforms by moving into an owner module in its own package, with a runtime
  reader from that module where its package reads the attribute in code. Lab's
  Schedule reads Core's `data-astryx-popover-fallback-close`, and conforms
  through Core's public API or an attribute Lab owns.

These gaps are named here rather than treating partial checks as complete proof.
