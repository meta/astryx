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
      "INV16"
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
  shared naming grammar. Component-specific vocabulary stays local.
- **INV3 — One prop controls one independent concept.** A prop does not silently
  suppress an unrelated prop. A parent does not duplicate state already owned by
  a composed child.
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
  behind a non-exported boundary.
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

This record applies to stable public packages. Lab components are not stable
public promises until promotion.

## Change coupling

- Adding or changing an exported prop, supporting type, context member, hook
  return, operation signature, default, package entry point, ref target, or
  intentional observable contract triggers public-API review. A top-level export
  need not change for a reachable supporting contract to change.
- Each review compares declarations and reachable exports from merge-base to head
  and from current main to the synthetic merge. The generated surface manifest
  inventories evidence and maps each row to its canonical component, family,
  architecture, or system owner; it does not decide acceptance.
- After the generated surface inventory identifies the exact API and behavior
  delta and its canonical owner, route it under
  `architecture:knowledge-contracts`. This record does not redefine review results
  or PR disposition.
- Consumer docs change when consumer usage or a documented promise changes, or
  when the existing docs would otherwise become false. Fixing an implementation
  defect does not by itself require consumer-doc changes.
- A new prop includes the admission argument from `spec:AST-002/DEC-1`; it does
  not get accepted only because it solves one callsite.
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
- `spec:AST-017/DEC-23` — a touch presentation or open-surface touch mode is
  a default the caller can always override, through one `presentation` prop
  that also restores the previous surface and mode.
- `spec:AST-012/DEC-6` — compact is one definition, the same on every platform.

Transition Action sequencing and pending behavior belong to their component or
family contract. This record links that owner once it is current; it does not
copy the component matrix.

## Verification

| Invariant               | Evidence                                                                             | Failure signal                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1, INV8              | Export, public-subpath, prop, and ref checks                                         | A promised component/type cannot be imported or its ref cannot reach the contract element                                                                                                                                                                                                     |
| INV2                    | Naming and logical-direction lint/tests                                              | Equivalent concepts use conflicting names or physical direction leaks into public API                                                                                                                                                                                                         |
| INV3, INV4              | Historical API review benchmark and `spec:AST-002` evidence                          | A prop combines unrelated axes or exposes a derivable implementation choice                                                                                                                                                                                                                   |
| INV5, INV6, INV7        | BaseProps/passthrough lint and representative runtime tests                          | Consumer ARIA/data/style/events are dropped, clobber component semantics, or fail to compose                                                                                                                                                                                                  |
| INV9                    | Published-surface, Changeset, migration, and public-type checks                      | A released API changes without explicit compatibility evidence                                                                                                                                                                                                                                |
| INV11                   | Public-API admission review plus owning theming/component tests                      | A public semantic custom property exposes derivable or unsupported implementation detail                                                                                                                                                                                                      |
| INV12, INV13            | Generated declaration/export/behavior inventory plus canonical-owner mapping         | A reachable supporting type or behavior is called internal, or mechanical evidence is treated as permission to accept it                                                                                                                                                                      |
| INV14                   | `AppShell.test.tsx`                                                                  | A component hardcodes a divergent point or treats equality as below                                                                                                                                                                                                                           |
| INV15                   | Public-API review of the generated declaration inventory                             | A part or StyleX-typed styling prop ships without class-name and inline-style counterparts on the same element                                                                                                                                                                                |
| INV16                   | Public-API review of touch presentations plus coarse- and fine-pointer runtime tests | A stable component that presents a different surface or switches an open surface's input mode under a coarse pointer and has no `presentation` value that keeps its fine-pointer surface and mode; such a touch mode callers cannot reach; a default that overrides an explicit caller choice |
| INV17                   | Resolver tests at the compact edges plus public-API review                           | A component that chooses a presentation by screen size with its own numbers, or disagrees with the theme compact definition at width 768 or height 500                                                                                                                                        |
| Consumer-doc projection | `docPropReferences.test.ts` and `docPropLiterals.test.ts`                            | Docs name a nonexistent prop or omit public literal choices                                                                                                                                                                                                                                   |

Known verification gaps:

- The passthrough lint is warning-only while known violations remain.
- The current source-to-doc completeness matcher still looks for old prefixed
  props interfaces, so it does not yet prove full prop coverage.
- No checked-in generated manifest currently proves the complete reachable public
  delta across supporting types, context members, hook returns, utility signatures,
  defaults, CLI schemas, and observable behavior for both the branch and synthetic
  merge. Reviews must build that inventory explicitly until enforcement exists.

These gaps are named here rather than treating partial checks as complete proof.
