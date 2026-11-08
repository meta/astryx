---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-006
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-31
phase: shipped
owners: [cixzhang, rubyycheung, imdreamrunner]
affects_architecture:
  [
    architecture:theme-authoring-contract,
    architecture:theme-tokens,
    architecture:theme-compilation,
  ]
affects_families: []
affects_contributing: []
affects_consumer_docs: [theme]
---

# Theme-local tokens system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "tokens": ["DEC-1", "DEC-2", "DEC-3", "DEC-4", "DEC-5", "DEC-6"]
  }
}
```

## Intent

Let a maintained theme reuse one of its own semantic decisions across component
overrides without adding that decision to Astryx's portable token vocabulary.
Theme authors get one explicit, checked path for theme-family-local reuse;
component and application authors keep the same portable token contract they have
today.

The shipped API is one optional `DefineThemeInput.localTokens` field. Supplying it
explicitly enrolls a theme in the contract; omitting it preserves existing behavior. A
local token is declared with any valid CSS custom-property name and referenced by that
same exact name. Prefixes do not grant, reserve, or restrict ownership. Descendants
inherit enrollment and may replace exact names only through an enrolled exact
`extends` lineage. Mere emitted CSS creates no contract, but a shipped enrolled
definition recorded by its owning theme spec does: its exact name and semantic meaning
are public within that theme family, not portable across themes or intended for Core
component source.

This current record governs the cross-theme API and invariants independently of
whether any particular theme has completed its own adoption evidence. The original
local-token surface is shipped; the 2026-09-12 naming amendment is accepted and awaits
its implementation. Theme-local names, meanings, values, mappings, and rendered
evidence remain owned by each adopting theme's colocated record.

## Non-goals

- Changing the type, accepted inputs, runtime or build behavior, permissive
  spread behavior, names, precedence, inheritance, output, or resolution of the
  existing `DefineThemeInput.tokens` path.
- Adding a `defineLocalTokens` helper, a second authoring operation, a shorter
  role identifier, a reference alias, or a parallel local-token API.
- Adding theme-local names to `TokenName`, `tokenVar`, `tokenVars`,
  `resolveThemeToken`, generated portable token documentation, or Core component
  source.
- Creating an application-consumer token extension mechanism. A compiled custom
  property is an implementation output of its maintained theme family, not
  authorization for application code to depend on it.
- Defining any adopting theme's role meaning, value, component mappings, or
  evidence. Those belong to that theme's colocated record.

## Requirements

The requirements below are the current cross-theme contract.

- **FR1 — Local tokens are purely additive, optional, and explicitly enrolled.**
  `DefineThemeInput` MUST gain at most one new authoring surface: optional
  `localTokens`. Supplying `localTokens` explicitly enrolls that theme in the new
  contract. A descendant inherits enrollment only by extending an enrolled exact
  base. A theme that neither supplies the field nor extends an enrolled exact
  base remains unenrolled and MUST produce byte-equivalent `DefinedTheme` data,
  runtime behavior, static output, package output, and resolution behavior.
- **FR2 — Existing token behavior is frozen and local values reuse its value
  contract.** This contract MUST NOT change `tokens` typing, accepted inputs,
  runtime handling, static handling, permissive unknown-key or broad-spread
  behavior, names, precedence, inheritance, output, or resolution. Existing
  casts, spreads, external CSS variables, and legacy token references MUST NOT
  receive new warnings, failures, reinterpretation, or migration requirements.
  Inside the opt-in `localTokens` field, each value MUST accept the complete
  existing `TokenValue` contract: a CSS string or `[light, dark]` tuple. Runtime
  and static build MUST apply the same value normalization semantics existing
  `tokens` use, without changing that existing path or normalizing theme names.
- **FR3 — One exact name survives every stage.** A local token declaration MUST
  use its complete CSS custom-property name as the `localTokens` key. The same
  exact string MUST be used in `var(...)` references, `DefinedTheme` data,
  runtime CSS, static CSS, inherited replacement, and generated theme-specific
  types or metadata. No transform may create a second identifier.
- **FR4 — Any valid custom-property key is accepted.** Every newly declared
  `localTokens` key MUST be a valid CSS custom-property name and MUST be preserved
  byte-for-byte. No prefix is required, reserved, rewritten, or interpreted as owner
  or enrollment metadata. A theme name and a local-token key are independent; this
  contract defines no preferred replacement naming pattern.
- **FR5 — Local use stays inside the maintained theme family.** A local name MAY
  be referenced by the maintained enrolled theme that defines it and by
  descendants enrolled through its exact `extends` lineage. It MUST NOT become a
  portable cross-theme token or a dependency in Core component source. Mere CSS
  emission from an unenrolled legacy path creates no contract. Once an enrolled
  theme ships a local token documented in its colocated theme-level spec, the
  exact name and semantic meaning ARE a public compatibility contract of that
  theme family.
- **FR6 — Extension is exact-name, enrollment, and lineage-aware.** A descendant
  inherits enrollment and declarations only from an enrolled exact `extends` base. It
  MAY replace an inherited local token only by restating that inherited complete name.
  A newly declared name is owned by the declaring theme regardless of its spelling.
  Prefix, suffix, or value similarity MUST NOT create ownership or lineage, and a child
  MUST NOT claim another theme's declaration.
- **FR7 — Validation is atomic for enrolled themes only.** Runtime and static build
  MUST share one recursive validator. For a theme enrolled directly or through an
  enrolled exact base, it MUST validate each declaration's custom-property syntax,
  exact owner and lineage, collisions with portable `tokens`, and cycles among exact
  declared references across local-token values, component overrides, media surfaces,
  and adaptations before producing partial output. An adaptation `value.tokens` key
  that exactly matches an effective local declaration MUST fail so the write uses
  `value.localTokens` and retains owner, lineage, and cycle validation. A `var()`
  reference is a local edge only when it exactly matches an effective enrolled
  declaration; every other custom-property reference remains external. Prefixes have
  no validation meaning.
- **FR8 — Unenrolled legacy behavior is grandfathered unchanged.** When
  `localTokens` is absent and the exact base is not enrolled, runtime and static build
  MUST NOT add a new scan, rejection, warning, reservation, or interpretation for CSS
  custom-property references. Existing custom properties continue unchanged. A
  maintainer may leave that behavior unenrolled or explicitly migrate by supplying
  `localTokens`; no prefix changes either path.
- **FR9 — Source and built themes preserve one enrollment lineage.**
  Source-defined and built themes MUST retain equivalent exact local-token maps,
  enrollment state, and lineage metadata so descendants accept, inherit,
  replace, reject, and emit the same names without requiring a base stylesheet.
- **FR10 — Released names and meanings are compatibility obligations.** Once an
  enrolled local token ships, its exact name and documented semantic meaning are
  public contracts of the owning theme family. Renaming the local token or its
  enrolled theme, or changing that meaning, MUST use an explicit reviewed
  migration or alias that preserves the prior exact-name, meaning, and lineage
  contract for its compatibility window. Silent key replacement, semantic broadening,
  owner reassignment, and inferred descendant migration are prohibited.
- **FR11 — The colocated theme spec owns definitions and mappings.** Each
  theme-local token definition MUST live in the owning theme's colocated
  theme-level spec, including its exact name, semantic meaning, value, mappings,
  compatibility, and rendered evidence. A long generated name is acceptable when
  it accurately names the meaning shared by every context where it is applied.
  Adding a mapping is a theme-spec compatibility review: the context MUST
  genuinely match the documented meaning and MUST provide rendered evidence for
  its actual light/dark and relevant interaction states.

### Authoring shape

`defineTheme` remains the only authoring operation. Each `localTokens` key is the
complete CSS custom-property name used in `var(...)`, `DefinedTheme`, inheritance, and
emitted output. The key is preserved byte-for-byte and has no required prefix. Values
reuse the existing `TokenValue` contract and normalize exactly as existing `tokens`
values do. An adopting `theme:*` record owns each concrete role, value, and component
mapping.

### Platform support

- Supported feature/engine floor: the same CSS custom-property,
  `light-dark()`, theme scope, and browser support as existing web themes.
- Unsupported behavior: a platform compiler that cannot preserve a local role
  and its lineage MUST reject that enrolled input clearly rather than silently
  omit it or expose the CSS spelling as shared cross-platform API.
- Browser evidence: each adopting theme verifies its actual component mappings
  and color modes in real Chromium. Name, validation, inheritance, and
  runtime/static parity are structural and testable without visual evidence.

## Current-state impact

Current `main` keeps its closed portable core/domain token vocabulary and ships the
first-class `localTokens` field with the original prefix-based key validation. The
2026-09-12 amendment broadens only accepted local-token key spelling; implementation
remains pending. Unknown keys that reach permissive legacy paths can still serialize,
but only explicit `localTokens` enrollment creates ownership, reference closure, and
lineage validation.

- `architecture:theme-authoring-contract` owns the optional `localTokens`
  input, its exact-name map, explicit enrollment state, flattened inheritance,
  and lineage metadata;
- `architecture:theme-compilation` emits that exact map through the shared
  runtime/static compiler and applies one recursive validator only to themes
  enrolled directly or through an enrolled exact base; and
- `architecture:theme-tokens` continues to own the unchanged portable
  vocabulary and explicitly excludes theme-local names from its public helpers
  and documentation.

Those current architecture records project the approved behavior and cite the applicable
AST-006 decisions. Prefix-independent key acceptance remains a named conformance gap
until its implementation lands. A draft theme record may reference this current spec
while keeping its own value, mapping, and evidence decisions unresolved.

### Compatibility and adoption

- Adoption is per maintained theme family and optional. Existing themes are not
  migrated merely because the field exists.
- A theme that omits `localTokens` and does not extend an enrolled exact base remains
  byte-equivalent across `DefinedTheme`, runtime, static, and package outputs. Its CSS
  custom-property references receive no new scan, rejection, warning, reservation, or
  interpretation.
- Enrollment accepts any valid custom-property key. To migrate an existing custom
  property, the maintainer explicitly declares that exact key in `localTokens`;
  prefixes do not affect eligibility or ownership.
- Existing `tokens` and external-variable behavior remains byte-equivalent, including
  permissive broad spreads and runtime inputs.
- Local names and documented meanings become public theme-family compatibility
  obligations after release; they never become portable cross-theme or global
  Core token promises. Mere custom-property emission from an unenrolled legacy
  path does not create that contract.
- Each local definition and mapping lives in the owning package's colocated theme
  spec. Every new mapping reviews whether its context genuinely matches the
  documented meaning and supplies rendered evidence before adoption.
- Descendant compatibility follows explicit enrollment and exact lineage. A
  released enrolled theme or token rename, or semantic meaning change, requires
  an explicit migration or alias before descendants move.
- The infrastructure implementation carries its own Changeset. A later adopting
  theme output change carries a separate release note.

## Verification

| Contract      | Verification                                                                   | Representative states                                                                                                                            | Mutation or failure expectation                                                                                                                |
| ------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2, FR8 | Legacy type, runtime, build, resolution, and byte-output fixtures              | omitted field; direct tokens; broad spread; cast; external custom property; portable reference                                                   | Adding a scan to the omitted-field path changes legacy behavior.                                                                               |
| FR2           | Local `TokenValue` parity fixtures                                             | CSS string; `[light, dark]` tuple; reference value; runtime/static normalization; existing-token control                                         | Local values reject an existing form, normalize differently across paths, or alter the existing `tokens` control.                              |
| FR3, FR4      | Exact-name authoring, type, and output fixtures                                | valid custom-property keys with different prefixes; invalid custom-property key; exact reference; runtime and static output                      | Any stage rewrites a key, or validity/ownership changes because of a prefix.                                                                   |
| FR5, FR6, FR9 | Source- and built-base enrollment/lineage fixtures                             | root opt-in; child inherits exact base; child exact replacement; child new role; unenrolled and unrelated names                                  | A child gains ownership from spelling rather than exact lineage, or source/built enrollment differs.                                           |
| FR7, FR8      | Shared recursive validator fixtures for runtime and static build               | exact declared reference; external reference; portable collision; adaptation `value.tokens` collision; lineage mismatch; cycle; unenrolled theme | Enrolled errors emit partial output, paths disagree, a local write bypasses `value.localTokens`, or a prefix changes reference classification. |
| FR10, FR11    | Theme-package compatibility fixtures, colocated theme spec, and release review | exact name; documented meaning; enrolled theme rename; local-token rename; meaning change; alias window                                          | A released name or meaning changes silently, a definition lacks an owner, or a descendant loses its inherited contract.                        |
| FR11          | Per-mapping theme-spec review plus focused rendered evidence                   | exact role meaning; mapped components/states; light/dark; relevant interaction states                                                            | A mapping uses the token outside its documented meaning or ships without contextual rendered evidence.                                         |

### Completion criteria

AST-006 remains `shipped`; the 2026-09-12 naming amendment reaches conformance when
its implementation satisfies these criteria alongside the already shipped contract:

- optional `DefineThemeInput.localTokens` is the only new local-token authoring
  surface and its presence is the root enrollment trigger;
- a theme with no `localTokens` and no enrolled exact base is proven byte-equivalent,
  with no new custom-property scan, rejection, or warning;
- local values accept both existing `TokenValue` forms—a CSS string and
  `[light, dark]` tuple—and runtime/static normalization matches the existing
  `tokens` value path without changing it;
- every valid CSS custom-property key is accepted and preserved byte-for-byte through
  declaration, `var(...)` use, `DefinedTheme`, source/built inheritance, and emitted
  output, with no prefix semantics;
- descendants inherit enrollment only from an enrolled exact base; spelling never
  creates ownership or lineage;
- custom-property syntax, token collision, exact owner and lineage, and cycle failures
  are atomic and equal across runtime and static paths for enrolled themes only;
- built themes retain enrollment and exact lineage metadata sufficient for descendants
  without a base stylesheet;
- every shipped local definition is owned by its colocated theme-level spec, and
  its exact name and semantic meaning are treated as public compatibility
  contracts within that theme family;
- every added mapping passes theme-spec compatibility review and rendered
  light/dark and relevant interaction-state evidence showing that its context
  genuinely matches the documented meaning;
- public portable token types, helpers, docs, and Core component source do not
  expose local names as cross-theme API; and
- each adopter's colocated `theme:*` record owns its names, meanings, values,
  mappings, migration, and rendered evidence.

## Decision log

The decisions below were approved by `cixzhang` as part of this current specification.

### Amendment — Make local-token names prefix-independent

**Decider:** `cixzhang`, `2026-09-12`

Any valid CSS custom-property key is accepted in `localTokens`. Prefixes have no effect
on validity, ownership, enrollment, or lineage. This supersedes the naming-pattern and
reserved-prefix clauses previously recorded in FR4, FR6–FR8, DEC-2, DEC-3, and DEC-4.
Exact key preservation, explicit enrollment, owner metadata, exact `extends` lineage,
inheritance, portable-token collision checks, and cycle checks remain in force. This
amendment defines no replacement naming pattern.

### DEC-1 — Add one optional local-token field without changing tokens

**Reference:** `spec:AST-006/DEC-1`
**Decider:** `cixzhang`, `2026-08-31`

Use a purely additive optional `DefineThemeInput.localTokens` field. Supplying it
explicitly enrolls a theme; an exact descendant may inherit that enrollment from an
enrolled base. Keep `defineTheme` as the only authoring operation and preserve every
existing `tokens` type, input, runtime, build, spread, precedence, inheritance, output,
and resolution behavior. A theme with no `localTokens` and no enrolled exact base
remains byte-equivalent regardless of custom-property spelling.

Rejected: a `defineLocalTokens` helper, parallel API, implicit enrollment from a key's
spelling, module augmentation of the portable token vocabulary, or stricter validation
on existing token paths.

### DEC-2 — Preserve one exact, prefix-independent name

**Reference:** `spec:AST-006/DEC-2`
**Decider:** `cixzhang`, `2026-08-31`; amended `2026-09-12`

A `localTokens` declaration accepts any valid CSS custom-property key. The declaration
key is the CSS variable, and references use that same byte-for-byte name. No prefix is
required, reserved, rewritten, or interpreted, and the theme name does not determine
the key. This decision defines no preferred replacement naming pattern.

Rejected: generated names, reference aliases, hidden normalization, and any naming rule
that changes validity or ownership based on a prefix.

### DEC-3 — Bind replacement to exact extension lineage

**Reference:** `spec:AST-006/DEC-3`
**Decider:** `cixzhang`, `2026-08-31`; amended `2026-09-12`

A descendant inherits enrollment only from an enrolled exact `extends` base and may
replace an inherited exact name only when that name arrived through that lineage. A
new declaration is owned by the declaring theme regardless of its spelling. Source and
built themes retain equivalent enrollment and lineage metadata. Released enrolled
theme or token renames require an explicit migration or alias.

Rejected: prefix-, suffix-, or value-based ownership or lineage inference, foreign
owner claims, and silent key rewriting during extension.

### DEC-4 — Validate the exact enrolled declaration graph

**Reference:** `spec:AST-006/DEC-4`
**Decider:** `cixzhang`, `2026-08-31`; amended `2026-09-12`

Runtime and static build share one exact validator. After direct or inherited
enrollment, it checks custom-property syntax, portable-token collisions, exact owner
and lineage metadata, and cycles among exact declared references. A reference is local
only when it exactly matches an effective enrolled declaration; every non-matching
custom-property reference remains external. An unenrolled theme receives no new scan,
rejection, or warning. Prefixes play no part in classification.

Rejected: prefix-based classification, a broad external-variable validator, or using
the new field to close legacy runtime permissiveness.

### DEC-5 — The owning theme spec defines a public theme-family contract

**Reference:** `spec:AST-006/DEC-5`
**Decider:** `cixzhang`, `2026-08-31`

Theme-local token definitions belong in the owning package's colocated
theme-level spec. Once shipped, the exact token name and semantic meaning are a
public compatibility contract within that maintained theme family, even though
the token is not portable across themes and is not intended for Core component
source. Mere output from an unenrolled legacy path is not enough; explicit
enrollment, shipment, and the theme spec establish the contract.

A long generated name is acceptable when it accurately describes every context
where the theme applies it. Adding any mapping is therefore a theme-spec
compatibility review: the context must genuinely mean the documented role and
must carry rendered evidence for its actual light/dark and relevant interaction
states.

Rejected: treating local names as either global portable tokens or disposable
implementation details, defining them outside the owning theme spec, and reusing
a name in contexts that only happen to share a value.

### DEC-6 — Reuse the complete existing `TokenValue` contract

**Reference:** `spec:AST-006/DEC-6`
**Decider:** `cixzhang`, `2026-08-31`

`localTokens` accepts the complete existing `TokenValue` contract: a CSS string
or `[light, dark]` tuple. Inside the new opt-in field, both runtime and static
build apply the same value normalization semantics existing `tokens` use. This
reuses one established light/dark authoring model without changing the existing
`tokens` path or introducing another value shape.

Rejected: limiting local values to CSS strings only or defining local-specific
mode syntax and normalization.

## Open questions

None at the cross-theme API level. Adopting theme specs may retain checkable
rendered-evidence gates; their ownership, exact names, and semantic meanings are
not re-opened by those gates.
