---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:component-style-authoring
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
owners: [cixzhang]
applies_to: [packages/core/src/, packages/lab/src/]
verified_by:
  [
    internal/stylex-capabilities/scan.mjs,
    internal/eslint-plugin-astryx/no-border-shorthand.test.mjs,
    internal/eslint-plugin-astryx/no-stylex-null-override.test.mjs,
    internal/eslint-plugin-astryx/no-style-only-wrapper.test.mjs,
  ]
deciding_specs: [spec:AST-080/DEC-4]
---

# Component style authoring architecture

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "styling": ["INV1", "INV2", "INV3", "INV4", "INV5", "INV6"]
  }
}
```

## Purpose

Astryx component styling should lower to valid maintained CSS, compose predictably
with supported consumer styling, keep relational state scoped to the intended
component, and avoid DOM wrappers with no runtime responsibility.

This record owns six component-level authoring outcomes. It does not redefine
semantic tokens, public theme targets, extensible prop axes, public styling props,
icon resolution, bidirectionality, or React Server Component boundaries.

## System model

Component-owned styling begins in Core or Lab component source and lowers through
the repository's maintained StyleX pipeline. The author chooses among three kinds
of work:

1. **CSS-resolvable presentation.** The browser can derive the visual state,
   relationship, responsive condition, fallback, or transition from CSS.
2. **Behavioral state.** JavaScript owns information or interaction that CSS
   cannot derive. The component exposes only the resulting style inputs to StyleX.
3. **Structure with responsibility.** A DOM element exists because it owns
   semantics, behavior, a ref, a formatting context, or spacing outside a child's
   border box—not merely to relocate styles.

The pinned StyleX capability registry determines which syntax and helpers the
maintained pipeline supports now. Capability entries and lint matchers are
versioned enforcement facts, not permanent architecture vocabulary. Capability-
dependent review is testable only when the registry's recorded StyleX version
matches the installed package at the audited revision. A mismatch is untestable,
not evidence of conformance or violation.

## Boundaries and invariants

- **INV1 — Component-local styles lower through StyleX.** Shipped,
  component-owned style declarations use the repository's maintained StyleX
  lowering path. Separately owned global CSS, theme-compiler output, and consumer-
  authored styling remain with their named owners and are outside this invariant.
  Component-local raw CSS remains in scope when the maintained StyleX path supports
  the same result.
- **INV2 — CSS owns CSS-resolvable presentation.** When the pinned browser and
  StyleX capability set can derive a visual state, relationship, responsive
  condition, fallback, or transition in CSS, component code does not recreate that
  presentation with React state, Effects, observers, or animation-frame
  bookkeeping. JavaScript remains appropriate for behavior or information CSS
  cannot derive.
- **INV3 — Declarations remain valid and statically composable.** Supported
  component StyleX input lowers to valid maintained CSS and preserves independent
  property composition without requiring runtime property-removal or
  property-key-deduplication semantics. Exact shorthand, reset, and null patterns
  are versioned tooling rules rather than permanent architecture vocabulary.
- **INV4 — Relational state is component-scoped.** Ancestor, descendant, and
  sibling styling reacts only to the intended component-owned relationship. State
  from an unrelated outer container MUST NOT activate an inner component's visual
  state. Scoped markers are the current mechanism, not the permanent contract
  wording.
- **INV5 — Every wrapper has a named responsibility.** A wrapper exists only when
  it owns a semantic role, behavior or ref, a formatting context the child cannot
  absorb without changing its contract, or spacing outside the child's border box.
  A wrapper that only relocates styles to one child is removable when that child
  owns a compatible style-bearing DOM surface. A wrapper may instead own that
  boundary when the child has no compatible surface. Source clarity alone is not a
  normative responsibility.
- **INV6 — Component size is reported and touch-only cost is budgeted.** Every
  pull request that changes a component's code or styles reports, base against
  head, the gzip size of the JavaScript each changed component's import pulls
  in, including its transitive modules, and that component's gzip CSS delta in
  its package stylesheet (`spec:AST-080` FR8). A feature that runs only on a
  coarse pointer and adds more than 2 KB gzip of JavaScript or 1 KB gzip of CSS
  to one component is flagged. Its pull request either loads that JavaScript
  lazily, only when a coarse pointer needs it, so the component's import does
  not carry it, or justifies the cost. For flagged CSS, its pull request
  justifies the cost, because that CSS stays in the package stylesheet
  (`spec:AST-080` FR1, FR8). Sizes are gzip at the default compression level,
  and 1 KB is 1,024 bytes; measured as `spec:AST-080` FR8 measures CSS, a
  component's JavaScript size is the gzip size of one bundle holding its
  import and every module that import reaches. A shared JavaScript value
  table, such as a gesture or spring tuning table, ships to a component only
  the rows that component uses: importing a component does not pull in rows
  only other components read. The rule covers tuning tables only: StyleX
  variable groups follow `spec:AST-066` FR3, and message catalogs follow
  `architecture:internationalization` INV15.

## Authoring guidance

The following guidance helps satisfy the invariants but does not independently
create permanent API or compatibility requirements:

- Check `internal/stylex-capabilities/CAPABILITIES.md` before adding raw CSS or a
  JavaScript workaround. Prefer the supported CSS-native mechanism.
- Use logical properties and values for direction-sensitive styling. The canonical
  bidirectionality owner decides exceptions and observable RTL behavior.
- Use longhands, fallbacks, and explicit reset values in the forms accepted by the
  current StyleX version and repository lint rules. Those exact accepted forms may
  evolve without changing INV3.
- Guard hover-only visual enhancement by hover capability while preserving an
  operable keyboard, click, and touch path under the interaction owner.
- Component-local geometry may use literals when no semantic theme role exists and
  the value is a named component design decision. Theme-token authority decides
  whether a reusable semantic role belongs in the portable token vocabulary.
- A secondary render path composed into a host may rely on that host's structure
  and styling. INV5 applies to the DOM owner for that path rather than requiring
  every branch to look like the component's default render.

A guidance deviation becomes an architecture violation only when it breaks an
invariant above or another current owner.

## Delegated authority

This record does not absorb adjacent audit rules:

- **Icons and inline SVG.** `architecture:icon-resolution-and-component-slots`
  and the Icon component contract own semantic glyph resolution. Inline SVG is a
  defect when it reimplements a glyph that belongs to the shared registry;
  component-owned non-glyph vector shapes remain allowed when their component owns
  semantics and accessibility. Icon-scope and global/theme resolution changes
  remain with the icon and theme-authoring owners.
- **Tokens and literals.** `architecture:theme-tokens` owns portable semantic
  values. This record does not establish a universal literal allowlist.
- **Targets, anatomy, and extensible axes.** `architecture:component-theming-surface`
  owns target admission, painting anatomy, inheritance/delegation, anti-
  proliferation, guaranteed properties, and which visual axes may be theme-
  extensible.
- **Public styling and DOM contracts.** `architecture:public-component-api` owns
  `BaseProps`, `xstyle`, `className`, `style`, ref reachability, and exceptions for
  rootless, SVG-owning, provider, overlay, or otherwise non-DOM-owning components.
- **Bidirectionality.** A separate current RTL/directionality owner must define
  universal logical-direction outcomes. Physical-property lint and helper syntax
  are enforcement evidence, not authority supplied by this record.
- **React module boundaries.** A separate current RSC/module-boundary owner must
  define client entry points, directive placement, mixed/server-safe barrels,
  built-output preservation, and RSC-usable exports. This record does not turn
  `'use client'` placement into style policy.

## Audit-row routing

This record supplies shared authority for:

- **Q6 / T14:** wrapper responsibility through INV5;
- the durable composability outcome behind **Q7** through INV3;
- **T8:** component-local StyleX lowering and CSS-over-JS ownership through
  INV1–INV2;
- the valid-lowering outcome behind **T9** through INV3;
- **T10:** CSS-over-JS ownership through INV2; and
- **T11:** relational-state isolation through INV4.

Other intended rows remain with existing or future owners:

- **Q4 / T17:** icon architecture and the Icon component contract;
- **T2b:** theme-token architecture; literal examples remain audit guidance;
- **T13:** the future current bidirectionality owner plus lint enforcement;
- **T18:** icon resolution/scope and theme-authoring normalization;
- **T19:** component-theming-surface axis admission plus public API reachability;
- **T20:** public-component-api and its BaseProps enforcement;
- **T27:** component-theming-surface; numeric target-count bands remain audit
  heuristics; and
- **T30:** the future current RSC/module-boundary owner.

## Change coupling

Focused style-authoring review triggers when a component change adds or alters:

- a raw/global stylesheet or component-local non-StyleX styling path;
- JavaScript state, an Effect, observer, or animation frame used only for
  presentation CSS can derive;
- a StyleX construct outside the pinned capability set;
- shorthand/reset/null behavior that can prevent independent consumer property
  composition;
- ancestor, descendant, or sibling visual state;
- a DOM wrapper around one component or one visual child;
- a component-owned inline SVG that may represent a shared semantic glyph; or
- code or styles that run only on a coarse pointer, or a shared value table a
  component reads (INV6).

Review checks the invariant owned here and follows the delegated authority above
before assigning a verdict.

## Owning code

- `packages/core/src/` and `packages/lab/src/` — component-owned StyleX
  declarations and rendered structure.
- `internal/stylex-capabilities/` — versioned StyleX capability facts and scans.
- `internal/eslint-plugin-astryx/` — current authoring-pattern enforcement; lint
  implementation does not define permanent architecture by itself.

## Deciding specs

- `spec:AST-080/DEC-4` — every pull request reports component JavaScript and
  CSS size; touch-only JavaScript over 2 KB or CSS over 1 KB is flagged, and
  shared value tables ship only the rows a component uses (INV6).

The icon, theme-token, component-theming, public-API, bidirectionality, and
RSC owners retain the delegated decisions above.

## Verification

| Invariant           | Evidence                                                                                       | Failure signal                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1                | StyleX capability scan plus component-source mutation                                          | Shipped component styling bypasses the maintained lowering path without another named owner, including component-local raw CSS where that path supports the same result                                                                                    |
| INV2                | Equivalent CSS/JS mutation fixtures and real-browser presentation                              | JavaScript recreates CSS-resolvable presentation, flashes intermediate state, or disagrees with CSS conditions                                                                                                                                             |
| INV3                | StyleX compile fixtures and independent consumer-property override mutations                   | Input lowers to invalid CSS or changing one supported property cannot compose without removing another                                                                                                                                                     |
| INV4                | Nested unrelated-owner browser fixture across hover, focus-within, active, and disabled states | Outer component state activates an inner component's visual treatment                                                                                                                                                                                      |
| INV5                | Wrapper mutations in default and host-composed render paths                                    | Removing a wrapper changes no semantic, behavior/ref, formatting-context, outside-border-spacing, or required style-bearing DOM boundary                                                                                                                   |
| INV6                | Pull-request size report against base, with value-table import fixtures                        | A changed component with no base-against-head gzip JavaScript or CSS figure; a touch-only feature over 2 KB gzip JavaScript or 1 KB gzip CSS per component that is not flagged; importing a component pulls in value-table rows only other components read |
| Capability registry | Registry generation against the installed StyleX package                                       | Recorded and installed StyleX versions differ, so capability-dependent cases are untestable                                                                                                                                                                |
