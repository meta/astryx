---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:component-theming-surface
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
owners: [cixzhang, imdreamrunner]
applies_to:
  [
    packages/core/src/,
    packages/lab/src/,
    packages/charts/src/,
    packages/richtext/src/,
    packages/core/src/utils/themeProps.ts,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/theme/extensibleAxes.test.ts,
    packages/core/src/theme/derivedVarRegistry.test.ts,
    docs/contributing/api-conventions.md,
    docs/templates/knowledge/component-spec.md,
    scripts/check-knowledge.mjs,
  ]
verified_by:
  [
    scripts/check-knowledge.mjs,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/theme/extensibleAxes.test.ts,
    packages/core/src/theme/derivedVarRegistry.test.ts,
  ]
deciding_specs:
  [
    spec:AST-012/DEC-2,
    spec:AST-012/DEC-3,
    spec:AST-012/DEC-5,
    spec:AST-017/DEC-1,
    spec:AST-017/DEC-26,
    spec:AST-087/DEC-9,
  ]
---

# Component theming surface

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "theming": [
      "INV3",
      "INV4",
      "INV5",
      "INV6",
      "INV7",
      "INV8",
      "INV9",
      "INV10",
      "INV12",
      "INV14",
      "INV15"
    ]
  }
}
```

This record defines how component anatomy relates to the public theming API.

## Purpose

Theme authors need stable names for the visible component parts they can style,
without exposing every wrapper, slot, state, or implementation detail as a
permanent selector.

Component anatomy is the semantic inventory. The theming surface is an explicit,
qualified projection of that inventory—not a one-to-one copy.

## System model

A machine-readable block in each component spec maps every consumer-facing
anatomy entry to one theming disposition. The map is not included in generated
consumer docs:

1. **`target`** — this component promises a stable public target for the visible
   part, such as `selector-popup`.
2. **`inherits`** — the part has no separate target. It uses styles from this
   component's parent target, such as a Button label inheriting from `button`.
3. **`delegatesTo`** — another Astryx component owns the part and its target, such
   as a Selector label using `Field/field-label`.
4. **`none` with classified reason** — no current public target reaches this
   stable anatomy part. The required reason begins with exactly one factual
   classification:
   - `intentional:` — an approved boundary makes the part non-themeable now;
   - `reachability-gap:` — a current target should reach the part, but does not;
   - `unsettled:` — whether or how to expose the part still needs an owner decision.

`none` records current reachability. It does not by itself decide that a part must
remain unthemeable or authorize a future public target.

Every current, non-deprecated public target maps to an anatomy entry or to an
explicit family owner. Consumer `.doc.mjs` files continue to own anatomy names,
descriptions, and public target documentation. Component specs own the exact map
and explain only non-obvious rationale or exceptions.

Visual prop axes and states are selector capabilities of a target. They are not
separate anatomy parts or separate targets. Runtime `themeProps()` reflection,
public `.doc.mjs` `theming.targets[].visualProps` / `states` metadata, and checked
component-spec metadata describe those selector axes without exposing maintainer
dispositions to consumers; they do not declare which CSS properties have
guaranteed behavior.

An adaptation rule uses the same component target, axis, value-domain, and
extension validation as root `components`; it does not create a parallel
component-value policy. Built-in values and values accepted by authoritative open
primitive domains may be styled only inside a rule and need no matching root style
declaration. A custom value whose validity depends on theme enrollment is
introduced on the effective root `components` map, where build tooling can
generate unconditional module augmentation; adaptation rules may then restyle
that value under conditions.

The shared guaranteed-property catalog is:

| Category     | Exact authoring keys                                                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paint        | `color`, `backgroundColor`, `opacity`, `outlineColor`, `outlineOffset`, `outlineStyle`, `outlineWidth`, `boxShadow`, `textShadow`                                                                               |
| Border/shape | `borderColor`, `borderStyle`, `borderWidth`, `borderRadius`                                                                                                                                                     |
| Typography   | `fontFamily`, `fontSize`, `fontStyle`, `fontWeight`, `letterSpacing`, `lineHeight`, `textAlign`, `textDecorationColor`, `textDecorationLine`, `textDecorationStyle`, `textDecorationThickness`, `textTransform` |
| Padding      | `padding`, `paddingBlock`, `paddingBlockStart`, `paddingBlockEnd`, `paddingInline`, `paddingInlineStart`, `paddingInlineEnd`                                                                                    |

The initial catalog contains every standard CSS key used by the seven shipped
package themes except `height`: `backgroundColor`, `borderColor`, `borderRadius`,
`borderStyle`, `borderWidth`, `color`, `fontFamily`, `fontSize`, `fontWeight`,
`lineHeight`, `padding`, `paddingBlock`, and `paddingInline`. It adds the explicit
paint, typography, and logical-padding keys needed to make those categories
coherent. `height` remains a target-specific addition because it changes layout.

The catalog is a vocabulary, not an automatic guarantee on every target. Each
target's `guaranteedProperties` lists the exact rational subset it supports from
this catalog and any exact reviewed target-specific additions. Omission means
best effort; no exception entry is required.

The list is literal. A listed shorthand does not imply its longhands; a logical
property does not imply a physical counterpart; and one property does not imply
an alias such as `background`, `inlineSize`, or `outline`. Properties outside the
catalog, including `height`, `width`, `gap`, positioning, overflow, and grid/flex
structure, require an explicit target addition to become guaranteed.

Every declared property must produce a rational, observable result on the anatomy
part the target owns. Generic component styling may accept other CSS properties,
but acceptance alone is best effort, not a compatibility promise.

## Boundaries and invariants

- **INV1 — Participation is capability-based.** Core components participate.
  Lab components are exempt until they opt into public component theming or are
  prepared for promotion. At that point they must provide the same targets,
  metadata, anatomy dispositions, and validation as other participating
  components. Consuming semantic tokens alone does not enroll a component.
- **INV2 — Anatomy anchors public targets.** Every current target represents a
  stable semantic part, either locally or through an explicit family owner.
- **INV3 — Anatomy does not imply target proliferation.** Every participating
  anatomy entry has one component-spec mapping, but inheritance, delegation, and
  factual `none` are valid outcomes. A `none` reason distinguishes an intentional
  current boundary from a reachability gap or unsettled future exposure; it never
  silently decides future themeability. When desktop and touch render different
  parts or use different theming owners, they use separate anatomy rows. Those
  rows describe alternatives that are never mounted together outside the one
  transient copy during a presentation switch, and both follow the minimal
  construction of `architecture:component-style-authoring` INV7.
- **INV4 — Targets paint.** A target belongs on a stable visible element that
  paints theme-controlled output—not an event wrapper, speculative internal
  structure, or a node created only for layout plumbing.
- **INV5 — Composition preserves ownership.** A part rendered by a shared Astryx
  primitive delegates to that primitive's target unless the parent guarantees a
  distinct public visual contract.
- **INV6 — State stays on the owning target.** Variant, size, selection, disabled,
  and interaction state are reflected as target capabilities through
  `themeProps`; they do not create parallel targets solely for each state. An
  artwork request, such as `Icon.variant`, selects supplied artwork rather than
  styling and is not reflected.
- **INV7 — Guarantees use one catalog and exact target declarations.** The shared
  catalog defines the supported vocabulary, not an automatic target promise. Each
  target's `guaranteedProperties` lists the rational catalog subset it guarantees
  and any reviewed target-specific additions. Every listed property must produce
  an observable result on the owned anatomy part, with representative compiler
  and runtime evidence.
- **INV8 — Names imply nothing beyond themselves.** No shorthand, longhand,
  logical/physical counterpart, alias, or custom property is guaranteed unless
  its exact authoring key appears in that target's declaration. Omitted properties
  remain best effort; no exception mechanism is needed.
- **INV9 — Generic styling is best effort.** A target may accept CSS properties
  outside its declared guaranteed set through the generic styling pipeline. That
  acceptance does not promise a useful effect or compatibility across releases.
- **INV10 — Public semantic variables are admitted, not inferred.** When no
  guaranteed CSS property can express a caller-owned need, a component may expose
  a reviewed public custom property with purpose-based meaning, stable default or
  fallback, defined target/state scope, consumer docs, and compatibility
  coverage. It must pass the admission bar in
  `architecture:public-component-api`; an implementation gap does not
  automatically justify a new variable.
- **INV11 — Private expansion stays private.** The compiler may translate a
  guaranteed public property into one or more private `--_*` variables so the
  owning component can route, compose, or transform the value across its internal
  painters. By contract, those variables must not be authored directly or relied
  on by consumers. Exact mappings remain checked code/metadata, not copied prose;
  known enforcement gaps are recorded in `architecture:theme-compilation`.
- **INV12 — Aliases are compatibility, not anatomy.** Removed target aliases do
  not count as current semantic parts. Starting in 0.7.0, runtime target emission,
  component metadata, CLI discovery, theme build, and generated docs expose only
  canonical targets. Maintained themes, CLI templates, and copyable examples use
  canonical keys. The breaking release preserves the complete old-to-new mapping
  and migration path below under `spec:AST-017`.
- **INV13 — Family ownership is explicit.** A family document may own a shared
  target for several components, but local docs link to that owner rather than
  leaving ownership to inference.
- **INV14 — Extensible axes need a theme-independent fallback.** A prop axis may
  be theme-extensible only when it is visual and an unavailable custom value has
  one safe, deterministic baseline that does not depend on the active theme.
  `Heading.type` qualifies because required `Heading.level` provides that
  baseline. `Icon.variant` qualifies because an unlisted variant renders the
  request without a variant, which is the same for every theme. It is an
  artwork request, not a styling selector: the `icon` target does not reflect
  it, so it has no `themeProps()` reflection, `visualProps` entry, or
  component styling map. `Icon.size` does
  not: no missing custom size can be inferred without silently changing
  geometry, alignment, or composition. Behavioral, structural,
  placement, directional, and state-machine axes remain closed regardless. A
  theme may redefine an existing value on a closed axis, but it may not add one.
- **INV15 — Conditional styling does not create conditional API.** Adaptation
  component writes use the same shared validation as root component writes. A rule
  may style an independently valid built-in or open-primitive value without
  duplicating that target or value in root `components`. A custom value that
  becomes valid only through theme enrollment must be enrolled on the effective
  root surface before a rule uses it, so generated types never depend on a media
  condition. An unresolved shared-validation result carries into adaptations
  unchanged and tightens automatically when the shared contract becomes
  authoritative; it is not a permanent adaptation exemption or an extension
  point.

## Approved deprecated-surface removal

Version **0.7.0** removes the deprecated component-theming compatibility surface
in this section. This is a breaking change under `spec:AST-017`; the release
includes the exact old-to-new mapping and a staged migration codemod.

The approved target-alias migration is:

| Deprecated target             | Canonical target         |
| ----------------------------- | ------------------------ |
| `base-table`                  | `table`                  |
| `checkbox`                    | `checkbox-indicator`     |
| `codeblock`                   | `code-block`             |
| `codeblock-copy-button`       | `code-block-copy-button` |
| `codeblock-header`            | `code-block-header`      |
| `codeblock-title`             | `code-block-title`       |
| `date-input-clear-icon`       | `input-clear-icon`       |
| `date-range-input-clear-icon` | `input-clear-icon`       |
| `hovercard`                   | `hover-card`             |
| `multi-selector-clear-icon`   | `input-clear-icon`       |
| `navicon`                     | `nav-icon`               |
| `popover-surface`             | `popover`                |
| `progressbar`                 | `progress-bar`           |
| `progressbar-fill`            | `progress-bar-fill`      |
| `progressbar-mark`            | `progress-bar-mark`      |
| `progressbar-track`           | `progress-bar-track`     |
| `radio`                       | `radio-indicator`        |
| `radio-dot`                   | `radio-indicator-dot`    |
| `selector-clear-icon`         | `input-clear-icon`       |
| `statusdot`                   | `status-dot`             |
| `textarea`                    | `text-area`              |

The 0.7.0 removal also deletes the compatibility machinery used only for those
aliases: the `themeProps(..., {legacyNames})` option,
`ThemePropsOptions.legacyNames`, `ComponentThemingTarget.deprecatedFor`, and
alias-only filtering or discovery behavior.

Deprecated bare prop/value and state selector classes such as `.primary`, `.sm`,
and `.checked` are no longer emitted. Their stable replacement is the canonical
`astryx-*` target plus its explicit reflected `data-*` attribute. Semantic
`defineTheme({components})` keys remain supported; only the 21 deprecated target
spellings in the table above move to their canonical keys. Because an unqualified
bare class does not identify its prop/state axis and may be consumer-authored, the
codemod leaves it for manual review.

Canonical target names, semantic component keys, reflected `data-*` selectors,
and current target behavior are outside this removal authorization and remain
supported. Built-in and generated themes must migrate to canonical targets before
the aliases disappear. Static inline theme keys receive a supported migration;
dynamic theme objects and custom CSS receive the complete mapping above.

This record does not own semantic token definitions, theme authoring precedence,
how themes become output, or the design rationale for a component's appearance.

### DEP-0013 — Deprecate the 21 component-theming target aliases

| Field            | Value                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | `DEP-0013`                                                                                                                                                                                                                                                                                                                                                                                               |
| cleanup          | `CLN-0022`                                                                                                                                                                                                                                                                                                                                                                                               |
| package          | `@astryxdesign/core`, `@astryxdesign/cli`                                                                                                                                                                                                                                                                                                                                                                |
| surface          | Theme target names: the 21 aliases in the mapping table above, as `defineTheme({components})` keys and as `.astryx-<alias>` CSS classes, plus the machinery that exists only for them: `themeProps(..., {legacyNames})`, `ThemePropsOptions.legacyNames`, `ComponentThemingTarget.deprecatedFor`, and alias-only discovery and filtering                                                                 |
| old contract     | Each alias is emitted beside its canonical target on the same element, accepted by theme build, and listed by CLI discovery                                                                                                                                                                                                                                                                              |
| replacement      | The canonical target in the mapping table above, as both theme key and CSS class                                                                                                                                                                                                                                                                                                                         |
| direct authority | `architecture:component-theming-surface` INV12 and this section. Owners: `cixzhang`, `imdreamrunner`                                                                                                                                                                                                                                                                                                     |
| warning          | Theme build warns `Deprecated component target "<alias>". Use "<canonical>" instead.`; CLI discovery labels each alias with its replacement                                                                                                                                                                                                                                                              |
| migration        | Run `astryx upgrade --from <0.6 version> --apply --path .`; review each `TODO(astryx upgrade)` it adds                                                                                                                                                                                                                                                                                                   |
| codemod          | `migrate-deprecated-theme-surface`: renames static keys in theme `components` maps and alias classes in CSS. It adds a TODO when an old and a canonical key coexist. The four clear-icon aliases keep their owner scope in CSS with `:where(.astryx-<owner> *)`; a theme key cannot carry that scope, so the codemod adds a TODO. Computed keys and CSS inside strings are reported cases, not rewritten |
| downstream       | Maintained themes, CLI templates, and copyable examples use only canonical keys; the bundled and probe themes build with no alias                                                                                                                                                                                                                                                                        |
| transition       | `no prior transition`                                                                                                                                                                                                                                                                                                                                                                                    |
| state            | `proposed`                                                                                                                                                                                                                                                                                                                                                                                               |
| target plan      | `CLN-0022` in 0.7.0                                                                                                                                                                                                                                                                                                                                                                                      |

### CLN-0022 — Canonical theme targets only

| Field     | Value                                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id        | `CLN-0022`                                                                                                                                                                                                                                                               |
| lifecycle | `DEP-0013`                                                                                                                                                                                                                                                               |
| delta     | Components stop emitting the 21 alias classes. Theme build treats an alias key as an unknown component and suggests the canonical key. CLI discovery and generated docs list only canonical targets. `legacyNames`, `ThemePropsOptions`, and `deprecatedFor` are removed |
| rollback  | Restore alias emission, metadata, and discovery from the final 0.6 baseline                                                                                                                                                                                              |
| state     | `pending` — lands in a declared minor with its `[breaking]` Changeset                                                                                                                                                                                                    |

### DEP-0014 — Deprecate bare prop and state classes

| Field            | Value                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | `DEP-0014`                                                                                                                                                                                                                                                                                                                                                                                            |
| cleanup          | `CLN-0023`                                                                                                                                                                                                                                                                                                                                                                                            |
| package          | `@astryxdesign/core`                                                                                                                                                                                                                                                                                                                                                                                  |
| surface          | Rendered CSS classes: one bare class per visual prop or state value on every themed element (`.primary`, `.sm`, `.checked`; a value that starts with a digit keeps its prop prefix, such as `.level-2`), repeated on alias targets                                                                                                                                                                    |
| old contract     | A selector that qualifies an Astryx target with a bare value class, such as `.astryx-button.primary`, matches that prop or state                                                                                                                                                                                                                                                                      |
| replacement      | The canonical target plus its reflected `data-*` attribute, such as `.astryx-button[data-variant="primary"]`. Theme `components` keys are unchanged                                                                                                                                                                                                                                                   |
| direct authority | `architecture:component-theming-surface`, this section. Owners: `cixzhang`, `imdreamrunner`                                                                                                                                                                                                                                                                                                           |
| warning          | Consumer docs label the classes deprecated and name the replacement                                                                                                                                                                                                                                                                                                                                   |
| migration        | Run `astryx upgrade --from <0.6 version> --apply --path .`. Replace unqualified bare classes by hand, only where they target Astryx                                                                                                                                                                                                                                                                   |
| codemod          | `migrate-deprecated-theme-surface`: rewrites target-qualified bare classes in `.css` files to reflected `data-*` selectors, using every bare class the final 0.6 release emitted. It adds a TODO when a class Astryx once emitted has no known meaning on the target it qualifies. Unqualified classes cannot be classified, because a bare class does not name its axis and may be application-owned |
| downstream       | Generated CSS for every maintained theme contains no target-qualified bare class; the probe theme and visual gate exercise only `data-*` selectors                                                                                                                                                                                                                                                    |
| transition       | `no prior transition`                                                                                                                                                                                                                                                                                                                                                                                 |
| state            | `proposed`                                                                                                                                                                                                                                                                                                                                                                                            |
| target plan      | `CLN-0023` in 0.7.0                                                                                                                                                                                                                                                                                                                                                                                   |

### CLN-0023 — Reflected attributes only

| Field     | Value                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| id        | `CLN-0023`                                                                                                                 |
| lifecycle | `DEP-0014`                                                                                                                 |
| delta     | `themeProps()` emits one canonical target class and reflected `data-*` attributes; no bare prop or state class is rendered |
| rollback  | Restore bare-class emission from the final 0.6 baseline                                                                    |
| state     | `pending` — lands in a declared minor with its `[breaking]` Changeset                                                      |

## Change coupling

- Adding or renaming a `themeProps()` target updates its component-spec map,
  `.doc.mjs` public target metadata, generated/CLI discovery, and validation
  together. Copyable examples and maintained themes use canonical keys.
- The 0.7.0 deprecated-surface removal preserves every canonical target and
  semantic key, migrates built-in/generated themes first, and supplies the exact
  alias and bare-selector migration evidence named above.
- Adding consumer anatomy requires a deliberate component-spec mapping to a
  target, inheritance, delegation, or factual `none`. It does not automatically
  create CSS API. A `none` entry classifies the current state as `intentional`,
  `reachability-gap`, or `unsettled`; changing reachability updates the mapping,
  while future exposure still follows normal public-target review.
- Opening a prop axis to theme-defined values classifies the axis and records its
  no-match fallback in the owning component contract or governing system spec.
  Review proves the axis is visual, the fallback is safe and theme-independent,
  and every ineligible axis stays closed. A focused component test covers the
  custom value with no matching active theme rule. `extensibleAxes.test.ts`
  checks only the structural wiring: the public map, `themeProps()` reflection,
  and consumer metadata. An artwork axis keeps the public map check, because
  its map is the one theme build augments, but has no styling wiring: the guard
  exempts it from the `themeProps()` reflection and `visualProps` checks only,
  by an explicit list of artwork-request maps, currently `IconVariantMap`. Its
  focused fallback test renders an unlisted name.
- Adding a property to a target's `guaranteedProperties` records its purpose and
  scope, proves a rational observable effect on the owned anatomy part, and adds
  representative compiler/runtime coverage. Catalog membership alone does not add
  a target guarantee; target-specific behavior outside the catalog is admitted by
  the same reviewed declaration. Common property-to-variable behavior belongs to
  theme compilation.
- Adding a public semantic custom property first shows why no guaranteed CSS
  property expresses the need, then updates its component contract, consumer
  docs, stable fallback/default, scope, runtime evidence, and compatibility
  coverage together. It is not the default response to an unsupported property.
- Moving target ownership to a family updates every member's disposition and
  link in the same reviewed change.
- Expanding participation to another package first extends the consistency guard
  to that package; partial public targets without metadata are defects.

## Owning code

- Component `.doc.mjs` `usage.anatomy[]` owns the consumer-facing semantic part
  inventory and contains no theming disposition or maintainer rationale.
- Component `.doc.mjs` `theming.targets[]` owns discoverable canonical public
  targets and their visual prop/state selector axes. Removed aliases are not
  present in this metadata and do not count as anatomy. `visualProps` does not
  declare CSS property support.
- The approved property catalog is owned by this record. Target
  `guaranteedProperties` declarations will live in component `.doc.mjs`
  `theming.targets[]` once the authoring schema supports them; there is not yet a
  machine-readable field.
- Component `.doc.mjs` `theming.vars[]` owns documented custom properties and
  marks private implementation variables; `theming.derived[]` records checked
  public-property expansion metadata.
- A colocated component `.spec.md` `### Theming anatomy` block owns the exact,
  machine-readable anatomy-to-target dispositions. It is optional during
  migration, checked against consumer anatomy, and excluded from generated
  consumer docs. Nearby component-spec prose owns non-obvious rationale,
  exceptions, and links.
- Runtime `themeProps()` calls emit one canonical target and reflected `data-*`
  state/prop selectors.
- CLI discovery and theme build consume canonical target metadata; copyable
  examples omit removed aliases.
- `scripts/check-knowledge.mjs`, `themingTargets.test.ts`,
  `extensibleAxes.test.ts`, and `derivedVarRegistry.test.ts` enforce the
  source/metadata/generated relationship. `extensibleAxes.test.ts` proves only
  structural consistency; component contracts, review, and focused component
  tests prove whether an axis may be open and whether its fallback is safe.
- Family contracts own shared target semantics when multiple components adopt
  one part contract.

## Deciding specs

- `spec:AST-012/DEC-2` and `spec:AST-012/DEC-3` constrain adaptation component
  writes to the closed ordered rule model. `spec:AST-012/DEC-5` makes component
  validation shared with root themes and reserves effective-root presence for
  values whose validity depends on theme enrollment.
- `spec:AST-087/DEC-9` makes `Icon.variant` a theme-extensible axis whose names
  each theme lists once and whose fallback is the request without a variant.
- `spec:AST-017/DEC-26` builds components from minimal DOM; desktop and touch
  rows are never mounted together outside the one transient switch copy (INV3).
- `spec:AST-017/DEC-1` owns published compatibility classification and migration:
  compatibility-path removal is breaking. This record owns the exact deprecated
  theming cohort and its approved 0.7.0 removal window.

## Verification

| Invariant    | Evidence                                                                                                                                                                         | Failure signal                                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1         | Cross-package target/documentation inventory                                                                                                                                     | An exported target in a participating package is invisible to metadata or CLI validation                                                                                                                              |
| INV2, INV3   | Bidirectional anatomy-disposition/target check                                                                                                                                   | A current target has no semantic part owner, anatomy mechanically creates targets, or `none` silently becomes future policy; or separate desktop and touch rows are mounted at once outside the transient switch copy |
| INV4, INV5   | Component review plus rendered DOM inspection                                                                                                                                    | Public target lands on non-painting plumbing or aliases a child primitive without distinct semantics                                                                                                                  |
| INV6         | `themingTargets.test.ts` and `extensibleAxes.test.ts`                                                                                                                            | State/variant is invisible to the owner target or becomes an unnecessary parallel target                                                                                                                              |
| INV7, INV8   | Existing property fixtures (partial; gaps below)                                                                                                                                 | A declared property is missing evidence, or an unlisted counterpart is treated as implied                                                                                                                             |
| INV9         | API docs and compatibility review                                                                                                                                                | Generic property acceptance is presented as a supported compatibility promise                                                                                                                                         |
| INV10, INV11 | Existing registry/public-var/runtime tests (partial; gaps below)                                                                                                                 | A public semantic var bypasses admission, or a consumer must write a private var to reach promised behavior                                                                                                           |
| INV12, INV13 | Canonical-only runtime emission and discovery, removed-alias rejection, complete codemod mapping/tests, canonical maintained-theme/template inventory, and family-owner fixtures | A removed alias is emitted or discovered, the migration mapping is incomplete, canonical targets change, removed compatibility metadata survives, or ownership stays implicit                                         |
| INV14        | Component contract, owner review, focused no-match fallback test, and structural `extensibleAxes.test.ts` coverage with its explicit artwork-axis exemption list                 | An ineligible axis opens, a missing rule changes behavior unpredictably, the map/reflection/docs wiring drifts, or an artwork axis gains reflection or loses its exemption                                            |
| INV15        | Shared root/adaptation component-validation fixtures covering finite, open, enrolled, and unresolved domains                                                                     | Root and adaptation disagree, a valid open value requires a root style, a rule conditionally enrolls a custom value, or unresolved behavior becomes adaptation-specific                                               |

Known conformance and verification gaps:

- Component validation has unresolved domains while the shared contract remains
  incomplete. Root and adaptation surfaces carry the same result and diagnostic;
  this is shared validation debt, not an adaptation-specific exception or API
  admission. When the shared contract becomes authoritative, both surfaces tighten
  automatically. Independently valid built-in and open primitive values do not
  require matching root style declarations.

- The component schema has no machine-readable axis-classification or fallback
  field. `extensibleAxes.test.ts` therefore checks only structural consistency;
  it cannot infer whether an axis is visual or its fallback is semantically safe.
  Component contracts or governing system specs, owner review, and focused
  fallback tests provide that evidence without treating the structural guard as
  admission policy.
- Existing map-backed axes have not all been audited against INV14.
  `Pagination.variant` and `Banner.container` are known open structural axes and
  remain conformance gaps until their vocabularies are closed. Passing the
  structural guard does not make them eligible for extension.
- The shared catalog is approved, but the component-doc authoring schema has no
  `guaranteedProperties` field. The follow-up must add the exact-name field,
  migrate each current target with its rational catalog subset and reviewed
  additions, expose the declarations to discovery, and reject unknown or implied
  names. Until that migration lands, the catalog does not automatically guarantee
  any property on any target.
- CI does not yet require representative compiler and runtime evidence for each
  declared target/property pair. The follow-up must make missing output-path or
  observable runtime evidence fail validation; layout-sensitive additions also
  require internal-coupling and directionality evidence.
- Runtime/build private-variable rejection and media-surface derived expansion are
  separate compiler conformance gaps owned and specified by
  `architecture:theme-compilation`.

### Migration work from the 2026-08-30 audit

- Forty-three participating Core component docs have no anatomy inventory.
- Several anatomy docs rely on parent/family-owned targets without an explicit
  owner link.
- Lab components stay exempt until they declare public theming or prepare for
  promotion. The existing promotion guard checks participating Lab components.

Backfill component-spec maps and Core anatomy before making bidirectional
validation mandatory. The audit inventory is migration evidence, not policy.
