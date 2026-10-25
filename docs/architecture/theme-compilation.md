---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:theme-compilation
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-23
owners: [cixzhang, imdreamrunner]
applies_to:
  [
    packages/core/src/theme/generateThemeRules.ts,
    packages/core/src/theme/themeAdaptations.ts,
    packages/core/src/theme/derivedVarRegistry.ts,
    packages/core/src/theme/Theme.tsx,
    packages/cli/api/theme/build/build.mjs,
    packages/cli/api/theme/build/core-interception.mjs,
    packages/build/,
  ]
verified_by:
  [
    packages/core/src/theme/generateThemeRules.test.ts,
    packages/core/src/theme/defineTheme.test.ts,
    packages/core/src/theme/themeAdaptations.test.ts,
    packages/core/src/theme/onMediaTokens.test.ts,
    packages/core/src/theme/Theme.test.tsx,
    packages/core/src/theme/derivedVarRegistry.test.ts,
    packages/cli/clients/cli/commands/build-theme.adaptations.test.mjs,
    packages/cli/api/theme/build/build.test.mjs,
    packages/cli/api/theme/build/build.public-component-vars.test.mjs,
    packages/cli/api/theme/build/build.adaptation-core-compat.test.mjs,
    packages/cli/api/theme/build/build.packed-old-core.test.mjs,
  ]
deciding_specs:
  [
    spec:AST-006/DEC-2,
    spec:AST-006/DEC-4,
    spec:AST-012/DEC-3,
    spec:AST-012/DEC-4,
    spec:AST-087/DEC-2,
    spec:AST-087/DEC-9,
  ]
---

# Theme compilation

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "theming": [
      "INV2",
      "INV3",
      "INV4",
      "INV6",
      "INV9",
      "INV10",
      "INV15",
      "INV16"
    ]
  }
}
```

This record defines how one theme definition becomes usable styles.

## Purpose

A theme author defines a theme once. On the web, using the theme at runtime and
building it ahead of time must produce the same CSS behavior.

Other platforms may need different output. For example, a future native compiler
may produce style objects instead of CSS. It should still start from the same
theme definition.

## System model

The compiler receives a `DefinedTheme` from the theme-authoring system.

The current web compiler works like this:

1. `generateThemeRules` turns portable tokens, theme-local tokens, and component
   overrides into CSS rules.
2. Ordered adaptation rules compile to separate media blocks after root rules.
   Blocks preserve author order and are never merged or value-diffed; media-surface
   overrides compile after them.
3. The same code adds state rules, media-surface rules, scopes, and layers.
4. The `Theme` provider mounts those rules when a theme was not built ahead of
   time.
5. The CLI saves those rules into CSS and packages the related JavaScript and
   types.
6. A built theme preserves local-token ownership, effective width points,
   generative-axis metadata, and normalized ordered rules, and is marked so the
   provider does not compile or inject it again.
7. A built theme carries its function icon entries, `componentIcons` functions,
   and `iconVariants` list in its JavaScript, so built resolution returns the
   same nodes as the runtime theme. A function the build cannot carry fails the
   build.

For top-level declarations in base component target rules, the compiler preserves
generic CSS properties as written. When a guaranteed property needs to reach
internal painters, the checked registry additionally translates it into one or
more private variables and may replace the source declaration when applying it to
the target element would be wrong. Reviewed public semantic custom properties
pass through as direct author input. Direct private `--_*` input is prohibited by
the contract; current runtime, build, pseudo-rule, and media-surface conformance
gaps are listed below.

A future platform compiler may turn the same theme into a different output type.
Platform-specific details stay inside that compiler.

## Boundaries and invariants

- **INV1 — One definition can have many outputs.** Authors do not maintain
  separate definitions for the same shared theme intent.
- **INV2 — Web has one compiler.** Runtime and static builds call the same code to
  turn a theme into CSS.
- **INV3 — Mounting and saving do not change the rules.** The provider mounts
  compiled CSS. The CLI saves and packages it. Neither creates different theme
  behavior.
- **INV4 — Web uses one cascade contract.** Runtime and built CSS use the same
  scopes, `astryx-theme` layer, component overrides, and consumer precedence.
- **INV5 — Guaranteed properties remain observable.** The compiler preserves a
  guaranteed target property directly when that produces the promised effect. If
  internal structure prevents that, one checked registry entry may route,
  transform, or fan the public property out to one or more private component
  variables; the implementation choice cannot change the property's promised
  meaning.
- **INV6 — Private variables stay private.** Private `--_*` variables are
  compiler/component implementation details. Theme authors use the guaranteed
  property that owns them. Runtime and built authoring paths must reject direct
  private values rather than emitting them as plausible output.
- **INV7 — Public semantic variables pass through deliberately.** A reviewed
  public custom property is direct author input only when the component-theming
  contract admits it because no guaranteed CSS property expresses the need. The
  compiler must preserve it without turning private machinery into public API.
- **INV8 — Generic properties do not become promises by compiling.** The generic
  styling pipeline may emit properties outside a target's guaranteed set. Output
  alone does not make their effect or compatibility part of the public contract.
- **INV9 — Platform details stay out of shared authoring.** CSS selectors, layers,
  scopes, and custom properties belong to the web compiler. A native compiler
  may use native style objects.
- **INV10 — Shared intent keeps the same meaning.** A token or supported component
  override means the same thing across outputs. Platform-only features have an
  explicit support boundary.
- **INV11 — Theme-local names remain exact and prefix-independent.** For an enrolled
  theme, the compiler emits the normalized `localTokens` map beside portable
  declarations without rewriting names or values. A prefix neither grants nor
  restricts ownership. Exact references to effective enrolled declarations retain
  owner, lineage, collision, and cycle validation; non-exact references remain
  external. Runtime and static output use the same rules, and invalid enrolled input
  is rejected before either path writes partial CSS.
- **INV12 — Adaptation order is observable.** Root declarations emit first,
  adaptation blocks remain separate in authored order, and media-surface overrides
  emit last. Duplicate conditions and later root-restoring writes are preserved
  exactly; runtime and static output use the same blocks.

- **INV13 — A declaration stays inside its boundary.** The web compiler rejects
  only an authored property name or value that would escape or invalidate its CSS
  declaration/rule boundary. It drops that declaration and continues generating the
  rest of the theme, including inherited and conditional surfaces. The boundary
  check preserves valid authored CSS bytes, including quoted semicolons/braces,
  data URLs, escapes, closed comments, nested functions, vendor-prefixed names, and
  `!important`. It is not a property-value grammar validator. Legacy unenrolled
  token values retain their historical string interpolation; this check must not
  introduce a crash for values such as `null`. Existing construction validation,
  including atomic enrolled local-token validation, remains separate and unchanged.
- **INV14 — Reporting does not change compilation.** Dropped declarations produce
  runtime warnings and appear in the existing static-build receipt's `warnings`.
  The existing `generateThemeRules`, `generateThemeRulesSplit`, `generateThemeCSS`,
  `generateOnMediaCSS`, and `generateAdaptationCSS` operations may accept one
  optional `warnings?: string[]` collector. Supplying it only appends warning text
  instead of writing that text to the console; it does not change generated CSS,
  clear existing array entries, change validation, or mutate the theme. Omission
  retains normal runtime warning behavior. This transport does not introduce a
  callback API, exported diagnostics/options types, theme metadata, or a structured
  diagnostics schema. A CLI paired with an older core retains that core's existing
  compilation behavior; it does not pretend to detect drops the older core cannot
  report.
- **INV15 — Built icon resolution matches runtime.** A built theme resolves every
  icon request and slot request to the same node as its runtime theme, and its
  public icon and slot exports are the same node-valued and static views. Build
  tooling that generates or subsets icon artwork enumerates a theme's requests as
  every entry's key with each of the four sizes and either no variant or one
  variant that entry can receive under `spec:AST-087` FR4; it never enumerates a
  variant the entry cannot receive, such as a name only a child theme lists for
  an entry it inherits.
- **INV16 — Generated compatibility roles preserve declaration locality and the
  CSS cascade.** When the web compiler derives a status role from another public
  token, the alias is emitted inside the theme scope where its semantic source is
  effective, including reachable adaptation and media combinations. A media
  surface's unpaired `--color-accent` collapse is presentation context, not an
  authored Info pair, so it does not rebind `--color-info-emphasized`; authoring both
  `--color-accent` and `--color-on-accent` makes that media pair eligible. A nested
  theme derives from its nearest provider rather than retaining its parent's alias.
  Authored destination roles, source order, `!important`, `inherit`, concrete
  values, and cycles retain their normal CSS meaning. Runtime and static output
  use the same derivation.
- **INV17 — Theme generation establishes every status role.** For each
  `architecture:theme-tokens` INV11 status role a theme does not set, the web
  compiler derives one in the theme's generated CSS, at runtime and in the
  theme build, so a theme that sets only its base status colours still
  compiles to a complete status set. The normalized `DefinedTheme` keeps only
  the tokens the theme sets; non-CSS resolution (`architecture:theme-tokens`
  INV6) applies the same derivation. A role the theme inherits through
  `extends` counts as set; a role its parent only derived is derived again from
  the child's own sources:
  - `--color-icon-<status>` and `--color-border-<status>` alias
    `--color-text-<status>`, so a theme's text value, set or derived, reaches
    them unless the theme sets them too.
  - `--color-text-<status>` is the status hue at the lightness that reaches
    4.5:1 against the theme's default page and card surfaces in each colour
    mode.
  - `--color-on-info` takes the theme's `--color-on-accent`. The released
    `--color-on-success`, `--color-on-warning`, and `--color-on-error` keep
    their values and are never derived.
  - `--color-<status>-emphasized` is the status hue, adjusted only as far as
    needed for the theme's `--color-on-<status>` to reach 4.5:1 on it.
  - `--color-info-muted` is the Info hue at Core's pale-fill strength, 20%
    opacity in light mode and 25% in dark mode. The released
    `--color-success-muted`, `--color-warning-muted`, and `--color-error-muted`
    keep their values and are never derived.
  - `--color-on-<status>-muted` is the status hue at the lightness that reaches
    4.5:1 on the theme's pale status fill over the default surface.

  The status hue is the theme's base status colour for success, warning, and
  error. For Info it is the theme's accent when the accent is chromatic, and the
  theme's blue hue (`--color-icon-blue`) otherwise. When that source is not
  chromatic, the status hue is Core's own hue for that status, so every derived
  fill and text colour is chromatic. When a colour these computations measure
  (the status source, the default page or card surface, the pale fill, or
  `--color-on-<status>`) is not a concrete colour, such as an unresolved
  reference, it cannot be measured, so for that status each role aliases its
  INV16 source instead: the strong fill aliases the base
  status colour (the accent for Info), `--color-info-muted` aliases
  `--color-accent-muted`, and the text and pale-fill content roles alias the
  theme's matching hue text token (`--color-text-blue`, `-green`, `-yellow`,
  or `-red`). Those aliases carry the theme's own values: they are not derived
  values, so INV11's floors bind them only in Core and first-party themes,
  which use concrete sources. A value the theme sets always wins over a derived
  one. A derived value is emitted in the scope where its status hue is set
  (INV16), and runtime and static output derive the same values.

This record does not own:

- token names and defaults, including the meanings of theme-local names;
- `DefineThemeInput`, local-token enrollment and lineage, inheritance, or
  authoring precedence;
- which component parts and properties are public theme APIs; or
- provider nesting, root synchronization, and DOM observation after compilation.

## Change coupling

- Any change to how a web theme becomes CSS belongs in the shared compiler and
  is tested through both runtime mounting and CLI-built output. The Theme
  provider and CLI may mount or package compiled rules; they must not implement
  their own theme-to-CSS transformations.
- Adding or changing a guaranteed property path uses the target's exact
  `guaranteedProperties` declaration and adds representative compiler and runtime
  evidence that the property produces its promised effect on that target's
  anatomy part. Catalog membership alone is not a guarantee. If private expansion
  is needed, update the checked registry and component metadata in the same
  change.
- Adding or changing a public semantic custom property verifies direct runtime
  and built output, default/fallback behavior, and rejection of any private alias.
- Generic-property pass-through remains best effort and must not be documented or
  tested as a compatibility guarantee unless the component-theming record admits
  that property into the guaranteed set.
- Changing scope or layer output tests both source and distribution builds.
- Changing local-token emission or packaging verifies exact-name runtime/static
  parity, atomic failure, and preservation of built-theme lineage metadata.
- Changing adaptation output verifies authored block order, duplicate conditions,
  root-restoring writes, media-surface precedence, derived component lowering,
  and source/built extension parity.
- The CLI and core version independently, so a CLI that compiles adaptations
  against a core that does not is a supported pairing rather than a broken
  install. That pairing is bounded to the adaptation capability, not a general
  compatibility scheme for arbitrary older cores: a theme with no adaptation
  intent builds and emits the same CSS it always did, while valid rules, a custom
  width map, and present-but-malformed adaptation metadata all count as intent
  and fail with `ERR_CORE_INCOMPATIBLE` before any output is generated. A
  complete default width map with no rules is a no-op on both paths, because that
  is what core writes onto every resolved theme and every shipped built theme.
  Neither path may emit CSS with adaptation rules missing. Intent is read from
  resolved metadata when available; because a core that predates adaptations
  erases it, the build also records each raw `defineTheme()` input and associates
  it with the theme it produced. Only the selected theme's lineage decides, so an
  unused adaptive theme elsewhere in the graph does not fail a plain build. If
  that selected lineage contains an unobserved source package — whether the
  async fallback bypassed interception or CommonJS reached a core namespace that
  could not be wrapped — the build fails closed. Built package artifacts remain
  observable through their retained metadata. Captured raw typography, color,
  radius, and motion metadata is also retained when the old core omits `__axes`,
  so a current-core child extending the artifact resolves partial adaptation
  axes exactly as it would from source. Generated CSS is identical across the
  two cores for a theme with no adaptation intent; generated JavaScript and
  `@generated` provenance may differ because they record resolved metadata and
  the core version, so `--check` can legitimately report drift after an upgrade.
- Adding a platform compiler names the shared concepts it supports and tests
  that they keep the same meaning. Unsupported concepts fail clearly instead of
  disappearing.
- Declaration-boundary changes verify positive and negative scanner cases, local
  dropping with surviving neighbors, legacy token generation, and runtime/build
  parity across tokens, local tokens, variants, pseudo states, media surfaces,
  adaptations, inheritance, and Heading fallback rules. Collector tests verify
  append-only text, unchanged CSS with/without a collector, and build receipts.
- Build packaging may change without changing compiled theme behavior.

## Owning code

- `generateThemeRules.ts` owns the web compiler and canonical CSS output,
  including portable and theme-local declarations in the same scoped block.
- `Theme.tsx` mounts compiled CSS for themes that were not built ahead of time.
- `derivedVarRegistry.ts` owns checked mappings from guaranteed public properties
  to private component variables.
- Component `.doc.mjs` `theming.derived[]` mirrors those mappings;
  `theming.vars[]` distinguishes reviewed public semantic variables from private
  implementation variables.
- `packages/cli/api/theme/build/build.mjs` saves and packages compiled CSS. Its
  private-variable diagnostic is currently non-blocking; rejecting that input is
  a named conformance gap, not existing enforcement. It also owns the
  adaptation-capability check for the installed core: baseline generation is
  required, and `generateAdaptationCSS` is demanded by valid or malformed
  adaptation intent in authored, resolved, or built input.
  `core-interception.mjs` owns capturing authored input and its generative axes:
  it hands the loading theme a core whose `defineTheme` is wrapped to record each
  raw input against the theme it returned, and reports loader paths it could not
  cover so erased intent never passes as clean.
- Future platform compilers consume the same `DefinedTheme` behind this boundary.

## Deciding specs

AST-006 decisions 2 and 4, as amended on 2026-09-12, establish
prefix-independent local-token names and atomic shared validation for enrolled themes.
AST-012 decisions 3 and 4 establish ordered adaptation blocks and source/built metadata
parity. AST-087 decisions 2 and 9 establish function icon entries and the finite,
theme-level variant list that built resolution and icon-artwork tooling use. The system owner separately selected one definition with platform-specific
outputs and the guaranteed, best-effort, public-semantic, and private implementation
tiers.

## Verification

| Invariant        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Failure signal                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INV1, INV2, INV3 | Compiler imports and runtime/build comparison fixtures                                                                                                                                                                                                                                                                                                                                                                                                                                    | Runtime and build use different theme-to-CSS logic or produce different web rules                                                                                                                                                                                                                                                                                        |
| INV4             | `generateThemeRules.test.ts` and source/distribution cascade tests                                                                                                                                                                                                                                                                                                                                                                                                                        | Scope or layer order differs by output path                                                                                                                                                                                                                                                                                                                              |
| INV5             | Existing per-property fixtures (partial; gap below)                                                                                                                                                                                                                                                                                                                                                                                                                                       | A guaranteed property compiles but does not produce its promised observable effect                                                                                                                                                                                                                                                                                       |
| INV6, INV7       | Existing registry and CLI public-variable tests (partial)                                                                                                                                                                                                                                                                                                                                                                                                                                 | Private variables become authorable, or a reviewed public semantic variable fails build/runtime                                                                                                                                                                                                                                                                          |
| INV8             | Component target metadata and compatibility review                                                                                                                                                                                                                                                                                                                                                                                                                                        | Successful generic emission is treated as a guaranteed public behavior                                                                                                                                                                                                                                                                                                   |
| INV9, INV10      | Platform compiler tests when another compiler ships                                                                                                                                                                                                                                                                                                                                                                                                                                       | CSS details enter shared authoring, or shared theme intent silently disappears                                                                                                                                                                                                                                                                                           |
| INV11            | `defineTheme.test.ts` and `build.test.mjs` local-token fixtures                                                                                                                                                                                                                                                                                                                                                                                                                           | Runtime/static output rewrites a local name, disagrees, or leaves partial output after failure                                                                                                                                                                                                                                                                           |
| INV12            | `themeAdaptations.test.ts` and CLI adaptation build fixtures                                                                                                                                                                                                                                                                                                                                                                                                                              | Rule blocks merge/reorder/drop, surfaces lose precedence, or runtime/static CSS diverges                                                                                                                                                                                                                                                                                 |
| INV13, INV14     | Declaration scanner, generator, Theme mounting, CLI receipt tests, and the existing theme-family Chromium guard                                                                                                                                                                                                                                                                                                                                                                           | One unsafe declaration corrupts neighbors, valid CSS changes, legacy token generation crashes, or reporting changes CSS                                                                                                                                                                                                                                                  |
| Built themes     | Theme and CLI build tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Runtime recompiles a built theme, or built output omits canonical rules                                                                                                                                                                                                                                                                                                  |
| INV15            | CLI build fixtures with function entries, slot functions, a variant list, and an inherited entry under a replaced list, compared with runtime resolution                                                                                                                                                                                                                                                                                                                                  | Built and runtime icons differ, a function is dropped silently, or tooling enumerates a variant an entry cannot receive                                                                                                                                                                                                                                                  |
| INV16            | Root, adaptation, media, nested-theme, and CLI-built status-alias fixtures                                                                                                                                                                                                                                                                                                                                                                                                                | A generated role escapes its source scope, overrides an authored role, changes cascade meaning, treats an unpaired media accent collapse as Info, cycles, or differs by output path                                                                                                                                                                                      |
| INV17            | A minimal custom theme that sets only `--color-success`, `--color-warning`, `--color-error`, and an accent, compiled at runtime and through the CLI build, plus one theme that overrides `--color-text-<status>`, one with a grey accent, one with a grey base status colour, one whose base status colour is an unresolved reference, one whose card surface is an unresolved reference, and one that `extends` a theme setting a status role, each also read through non-CSS resolution | A status role is missing, misses an INV11 floor in light or dark mode, is grey, ignores a value the theme set, or differs between runtime, build, and non-CSS resolution; or an overridden text colour does not reach an unset icon or border role, an inherited role is derived again, or a non-concrete measured colour yields a computed value instead of the aliases |

## Known conformance and verification gaps

Generated status roles (INV16) and derived status defaults (INV17) are
accepted but not yet shipped. Their verification rows describe implementation
acceptance, not existing enforcement.

Declaration-boundary enforcement and the warnings-array collector in INV13–INV14
are accepted but not yet shipped. Their verification obligations above describe
implementation acceptance, not existing enforcement.

Prefix-independent `localTokens` key acceptance is accepted but unshipped. The current
compiler still requires the original theme-derived prefix and uses that prefix to
classify local references. Until implementation lands, INV11's prefix-independent
clauses are current authority but not enforcement; exact-name emission and the existing
enrollment, owner, lineage, collision, cycle, and legacy-unenrolled behavior remain
shipped.

The remaining invariants above describe the approved current contract. The following
shipped behavior does not yet conform and must not be treated as enforcement:

- **Private author input is not rejected end to end.** `themeBuild` reports direct
  `--_*` values as errors in its receipt/log, but continues compiling and emits
  them. Its validation checks only the top-level declarations under
  `components`; nested pseudo declarations and media-surface components bypass
  it. Runtime `defineTheme` has no equivalent validation and accepts them. The
  follow-up must reject direct private variables recursively before CSS
  generation across both paths and prove runtime/static parity.
- **Nested pseudo component declarations bypass derived expansion.** Top-level
  component declarations at the root, in adaptations, and under
  `onDark.components` / `onLight.components` use `derivedVarRegistry`, including
  `replaces` and container expansion. Nested pseudo declarations on those
  surfaces still serialize properties directly. The follow-up must route nested
  pseudos through the same component-declaration lowering path, with parity
  fixtures for a normal mapping, `replaces`, and container padding.
- **Guaranteed-property coverage is not machine-complete.** The shared catalog is
  normative, but the component-doc schema has no per-target
  `guaranteedProperties` declarations. CI therefore cannot prove that a target
  rationally supports its selected catalog subset or reviewed additions. The
  follow-up must add and migrate that metadata, then fail when a declared
  target/property pair lacks both output-path and observable runtime evidence.

These invariants are the approved rules governing implementation and review. The
nonconformities above are shipped defects against that contract, not proposed
behavior.
