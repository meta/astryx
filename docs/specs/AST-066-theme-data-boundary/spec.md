---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-066
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-20
phase: accepted
owners: [cixzhang]
affects_architecture:
  [
    architecture:theme-compilation,
    architecture:theme-application,
    architecture:theme-tokens,
  ]
affects_families: []
affects_contributing: []
affects_consumer_docs: [theme]
---

# StyleX data-token ownership system spec

## Prebuilt Core CSS carries the data-token defaults

The public `dataVars` entry in prebuilt mode contains compiled `var()` references,
not a `defineVars()` call. An application using that entry and the shipped Core
CSS has no StyleX extraction step that can materialize the referenced defaults.
Core's prebuilt stylesheet therefore carries the group as part of its public
CSS contract; theme presence does not control its availability.

## Intent

Astryx owns one canonical 56-token data palette in the same public StyleX token
system as its other design tokens. Components import the public StyleX variable
object instead of constructing literal `var(--color-data-*)` strings. The
StyleX compiler emits the canonical group when a source-compiled consumer uses it
and omits the group from graph-based source builds that do not use it. Core's
prebuilt `astryx.css` and the `@astryxdesign/build` PostCSS integration include
the group whether or not a consumer imports it.

A concrete theme emits only data-token values that the theme explicitly authors,
inside its existing theme donut. It never carries the canonical defaults or a
raw global data-token block. Unspecified data colors use the StyleX defaults and
normal CSS inheritance; a nested theme changes only the subset it authors.

The public CSS custom-property names, JavaScript token resolution, generated
JavaScript marker, and three existing global `color-scheme` rules remain stable.
Runtime and built theme compilation produce the same sparse scoped override.

StyleX 0.19 tree-shakes `defineVars` at the module/group boundary, not per
property. The 56 data variables intentionally form one semantic group: a
graph-based source build emits zero data defaults when the module is unused and
all 56 when any member is used. The prebuilt Core stylesheet and the
`@astryxdesign/build` PostCSS integration always include the complete group. The
contract does not claim token-granular pruning that the compiler does not provide.

## Non-goals

- Changing the names or values of the 56 canonical data defaults.
- Adding a separate CSS defaults asset or keeping a parallel plain-JavaScript
  token family as an independent source of truth.
- Making concrete themes repeat defaults they do not author.
- Scoping, renaming, or redesigning the three existing global `color-scheme`
  selectors.
- Changing scoped prose defaults, non-data token declarations, component
  overrides, adaptations, MediaTheme rules, icon output, or type augmentation.
- Defining the separate `@astryxdesign/build` source-build composition contract,
  beyond FR3's data-group guarantee for its PostCSS integration.
- Release scheduling and versioning beyond the breaking-minor requirement in
  FR17.
- Equivalent internal implementations remain valid when they satisfy this
  public contract.

## Requirements

### Canonical source, public API, and typing

- **FR1 — The public StyleX source owns every derived view.** The checked-in
  `dataTokens.stylex.ts` module MUST be the sole canonical source for all 56 names
  and default values. It contains the static object literal consumed by
  `stylex.defineVars()` and exports the public `dataVars` object.

  Generation MUST read that `.stylex.ts` source and produce:

  1. the existing plain `dataTokenDefaults` compatibility view without importing
     the StyleX value module into ordinary token-resolution graphs;
  2. `DataTokenName` and the theme-input validation inventory; and
  3. any generated documentation inventory.

  `dataTokenDefaults` MUST NOT be hand-maintained independently from `dataVars`.
  A repository check MUST fail when generated values, names, or types drift from
  the canonical `.stylex.ts` source. The canonical file MUST keep a static object
  literal because StyleX rejects an imported object as a `defineVars()` argument.

- **FR2 — Data variables are an explicit public StyleX subpath.** Core MUST
  export `dataVars` from
  `@astryxdesign/core/theme/dataTokens.stylex`. Every existing public custom
  property name remains byte-for-byte stable, for example:

  ```ts
  import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';

  const positive = dataVars['--color-data-categorical-green'];
  ```

  The package export MUST use the same `source`, `types`, and `default` condition
  shape as `@astryxdesign/core/theme/tokens.stylex`; the existing StyleX
  `sideEffects` declaration continues to cover the source module. The focused
  subpath prevents ordinary Theme, token-resolution, or non-data component
  imports from retaining the StyleX variable group as a side effect in source
  compilation. In prebuilt mode the same public entry provides compiled `var()`
  references; loading `@astryxdesign/core/astryx.css` MUST supply their defaults
  without requiring a consumer StyleX compilation step.

- **FR3 — Tree-shaking is truthful at the group boundary.** A graph-based
  source compilation, one that compiles the modules reachable from the
  product's imports, with no value import from the data StyleX subpath MUST emit
  no `--color-data-*` default declarations. A graph that retains any `dataVars`
  value import MUST emit one canonical StyleX variable group containing all 56
  defaults. Importing one member is not required to prune the other 55.

  The `@astryxdesign/build` PostCSS integration compiles every module Core
  publishes rather than a reachable graph. Its output MUST contain exactly one
  canonical 56-variable group, with every canonical name and value, whether or
  not the product imports `dataVars`.

  Core's prebuilt `@astryxdesign/core/astryx.css` MUST contain exactly one
  canonical 56-variable group even when no Core component consumes it. The
  package's compiled public `dataVars` entry exposes CSS references that this
  stylesheet MUST define; consumer imports cannot trigger extraction from the
  already-compiled entry. This exception applies only to the prebuilt Core
  stylesheet and the PostCSS integration above, not to graph-based source
  compilation or concrete themes.

  Distribution output MUST remain dependency-aware: referenced cross-package
  StyleX variable dependencies appear exactly once across a satellite stylesheet
  and its required provider stylesheet. A data-consumer package whose provider
  already declares the group MUST NOT repeat it; without that provider, a
  retained group MUST be emitted. Unreferenced groups other than the explicit
  Core distribution exception remain absent. Bundle evidence MUST report the raw
  and compressed cost of the retained group.

  Supported source and distribution integrations MUST place the emitted variable
  group in `@layer astryx-base`, like other Astryx StyleX output. An unlayered
  StyleX pipeline is outside the authored-theme-override guarantee in FR8–FR10 and
  MUST be diagnosed or documented rather than silently claimed as equivalent.

### Consumer behavior

- **FR4 — CSS-capable consumers use the public object.** Astryx TypeScript and
  TSX consumers MUST import `dataVars` when passing a selected value to StyleX,
  DOM styles, or SVG presentation attributes. They MUST NOT construct literal
  `var(--color-data-*)` strings. This includes default prop values such as
  candlestick up/down colors.

  CanvasRenderingContext2D and other non-CSS APIs MUST NOT receive `dataVars`
  `var()` references. They MUST use the existing concrete mode-resolved JavaScript
  path, such as `resolveThemeToken()` or `useTheme().token()`, consistent with
  FR13. The generated compatibility view keeps that resolver derived from the
  same canonical `.stylex.ts` source.

  In prebuilt mode, raw CSS and consumer code MAY reference the stable
  `var(--color-data-*)` names with no fallback: the prebuilt Core stylesheet
  defines the complete group under FR3. A source-built product reads data colors
  through `dataVars`, which retains the group in the source graph. The
  `@astryxdesign/build` PostCSS integration always emits the group under FR3; a
  graph-based source build that does not import `dataVars` leaves raw
  references undefined, which is unsupported. An explicit local fallback remains valid in
  every mode. Documentation MUST not imply that a theme stylesheet itself
  materializes the defaults.

- **FR5 — Direct SVG and DOM values paint correctly.** A `dataVars` value passed
  directly to an SVG presentation attribute or DOM style MUST compile to the
  stable `var(--color-data-*)` reference. In source compilation the import MUST
  retain the variable-definition module; in prebuilt mode Core's stylesheet MUST
  provide the group under FR3. Default and theme-overridden values MUST paint the
  expected fill and stroke. An undeclared data variable paints a candlestick
  body black and drops its wick stroke; that state MUST NOT recur.

### Sparse theme output

- **FR6 — Concrete themes emit only explicitly authored data values.** Runtime
  and static theme compilation MUST identify the authored input set before
  default resolution. For every explicitly authored `--color-data-*` name, the
  concrete theme emits that declaration in its existing `astryx-theme` donut:

  ```text
  @layer astryx-theme {
    @scope ([data-astryx-theme="ocean"]) to ([data-astryx-theme]) {
      :scope {
        --color-data-categorical-blue: light-dark(#0077B6, #48CAE4);
      }
    }
  }
  ```

  A theme that authors no data values emits none. A partial authoring set emits
  exactly that subset. Resolved defaults, compatibility maps, and inherited
  parent values MUST NOT be serialized as though the theme authored them.

- **FR7 — Theme build never emits raw global data defaults.** Neither runtime
  `<Theme>` injection nor standalone, multi-file, or family `theme build` output
  may emit canonical data defaults on `:root`, `html`, `body`, or another
  out-of-donut selector. Theme compilation MUST not call, inline, or retain a
  raw `generateDataTokenDefaultsCSS()` equivalent. The canonical StyleX group,
  retained by source consumers or Core distribution under FR3, is the only
  CSS-default owner.

  Removing the old defaults block MUST NOT remove its layer-order side effect.
  Every standalone, multi-file, family, and runtime theme output MUST retain an
  explicit order registration equivalent to:

  ```text
  @layer reset, astryx-base, astryx-theme;
  ```

  The registration contains no data declaration. It keeps `astryx-base` below
  authored theme overrides regardless of whether theme CSS or component CSS loads
  first.

### Cascade behavior

- **FR8 — Nested themes inherit every unspecified data value.** Same-identity and
  different-identity nested themes use normal custom-property inheritance. A
  child that authors no data value inherits the parent's effective value. A
  child that authors a subset replaces only that subset inside its donut; every
  omitted name continues to inherit. Changing identity alone does not reset the
  palette.

- **FR9 — Sibling roots remain isolated for authored overrides.** A scoped
  override in one Theme root MUST NOT affect a sibling Theme root. Both roots
  resolve unspecified names from the same retained StyleX canonical group.

- **FR10 — Dynamic identity switching selects only authored deltas.** Under the
  required `reset < astryx-base < astryx-theme` order, and when all target theme
  stylesheets are loaded, changing a root's theme identity MUST add, remove, or
  replace exactly the selected theme's authored data subset. Every omitted name
  returns to the inherited StyleX default or ancestor value. Physical stylesheet
  order MUST NOT change the winner after the layer order is registered. Selecting
  a built theme whose CSS is absent remains incomplete consumer setup.

- **FR11 — Light and dark keep existing resolution.** Canonical and authored
  `light-dark()` data values MUST resolve from the effective `color-scheme` as
  other StyleX variables do. Explicit light, explicit dark, system mode,
  MediaTheme, same-theme nesting, and different-theme nesting preserve the
  existing mode contract.

### Availability and JavaScript compatibility

- **FR12 — Availability follows the compilation mode, not Theme presence.** A
  graph-based source build without a compiled consumer retaining `dataVars`
  contains no data-variable defaults. Core's prebuilt stylesheet always retains
  the group under FR3, because the compiled public entry alone cannot emit
  definitions, and the `@astryxdesign/build` PostCSS integration always retains
  it because it compiles all published Core source. In every mode, standard
  StyleX 0.19 output declares the complete group on
  `:root` plus its variable-group class, exactly like existing canonical StyleX
  token groups. This global declaration is an accepted compiler consequence of
  the chosen canonical token system; it MUST NOT be attributed to or duplicated
  by theme build.

  In supported Astryx source and distribution integrations, the emitted group
  MUST be wrapped in `@layer astryx-base`. A bare StyleX transform emits the same
  selector without a layer; on the document root that unlayered default outranks a
  layered theme override and can miscolor portals. Such a pipeline is outside the
  themed-override guarantee and MUST be diagnosed or documented explicitly.

  Consumers that require data variables only inside a Theme MUST enforce that
  usage boundary in component structure. This contract does not claim that a
  retained StyleX `defineVars` group is absent from unthemed DOM.

- **FR13 — JavaScript token resolution remains compatible.** Existing
  `dataTokenDefaults`, `domainTokenDefaults`, `tokenDefaults`,
  `resolveThemeToken()`, `resolveThemeTokens()`, `useTheme().token()`, and
  `useTheme().tokens` names and return shapes remain available. Their canonical
  data values derive from FR1. This work MUST NOT turn the token APIs into
  computed-style readers or change their existing provider/no-provider
  semantics.

### Runtime, built, and family parity

- **FR14 — Runtime and built theme output are equivalent sparse deltas.** For the
  same theme input, runtime and static compilation emit the same authored data
  names, values, layer, selector, and donut boundary. Neither path emits
  defaults. Generated JavaScript remains `__built: true`; the marker continues
  to mean that concrete theme CSS is loaded and runtime compilation is skipped.
  No fallback data injection or second marker is added.

- **FR15 — Family output contains only member-authored subsets.** One family CSS
  file contains each selected member's explicit data overrides under that
  member's identity. A zero-data-delta member contributes no data declaration.
  The family file never repeats the canonical 56. Nested members follow FR8,
  switching follows FR10, and the family file emits the global color-scheme
  policy at most once.

### Global color-scheme compatibility

- **FR16 — Complete bundles may keep one compatible global environment policy.**
  A concrete bundle MAY continue to emit exactly these three rules:

  ```text
  @layer astryx-theme {
    :root { color-scheme: light dark; }
    html[data-theme="light"] { color-scheme: light; }
    html[data-theme="dark"] { color-scheme: dark; }
  }
  ```

  A standalone concrete bundle that emits the policy MUST emit all three
  byte-equivalent selectors, declarations, and layer ownership. A theme MUST NOT
  specialize, partially emit, reorder, or otherwise diverge from that policy. A
  standalone bundle MAY omit the policy only as a complete set. Family
  aggregation retains its existing identity-scoped color-scheme composition;
  this specification neither redesigns that composition nor treats it as a new
  concrete-theme policy. These environment declarations do not permit theme
  build to emit data defaults globally.

### Compatibility, migration, and documentation

- **FR17 — The ownership move uses the breaking 0.x path.** The first release
  that removes theme-build global defaults MUST use the repository's breaking
  change process: a minor version for affected 0.x packages, a breaking
  Changeset, and migration notes. The break is observable for raw data-variable
  consumers whose graph does not retain `dataVars`, consumers that relied on
  concrete theme CSS to define globals, and generated artifacts that still
  contain the old root block.

- **FR18 — Migration prefers public imports, not compatibility CSS.** Astryx
  component, fixture, example, and test migrations MUST replace constructible
  literal strings with `dataVars` references when the source is StyleX-capable.
  Upgrade tooling and regeneration MUST reject stale raw root defaults. Upgrade
  tooling does not inspect direct raw consumers and MUST NOT require a fallback
  for them. Raw CSS and generated templates that already carry explicit
  fallbacks remain valid. Migration MUST NOT add a legacy global-data theme mode,
  provider prop, sidecar stylesheet, arbitrary Theme wrapper, or invented
  fallback color.

- **FR19 — Theme input validation and CLI output remain truthful.** Every stable
  data name remains valid theme input and every unknown name remains rejected.
  Theme build keeps its current CSS/JS/declaration filenames and pairing, but
  generated CSS and docs MUST describe data declarations as authored sparse
  overrides. `--check` and upgrade validation MUST fail an old artifact that
  still contains the canonical root block or a theme-scoped un-authored default.

- **FR20 — Consumer docs distinguish three paths.** Documentation MUST show:
  (1) `dataVars` for StyleX-capable component code, the path a source build
  uses; (2) JavaScript token resolution for APIs that need concrete
  mode-resolved values; and (3) raw CSS custom-property use in prebuilt mode,
  where `@astryxdesign/core/astryx.css` supplies the defaults, or with an
  explicit fallback. It MUST state whole-group tree-shaking honestly and keep
  color-scheme compatibility and release work outside this change.

### Platform support

- Supported browser floor: the existing Theme, StyleX, and `@scope` matrix.
- Unsupported behavior: browsers outside that floor retain the existing support
  policy; no global theme-build data fallback is added.
- Browser evidence: real Chromium computed styles and painted SVG values across
  the matrix in Verification.

## Current-state impact

The public StyleX data group owns canonical CSS defaults; the compatibility,
type, validation, and documentation views derive from it. Graph-based source
compilation retains whole-group tree-shaking. Core's prebuilt stylesheet supplies
the same group for the compiled public `dataVars` entry, without a consumer
compilation step or runtime Theme injection, and the `@astryxdesign/build`
PostCSS integration always emits it.

Concrete standalone and family themes contain only authored scoped overrides.
Nested themes inherit omissions, JavaScript resolution remains compatible, and
the global `color-scheme` rules, built marker, filenames, and paired CSS/JS/type
outputs are unchanged.

`architecture:theme-compilation` owns runtime/static sparse theme output.
`architecture:theme-application` owns provider nesting and style lifetime.
`architecture:theme-tokens` owns the shared vocabulary and derived compatibility
views; this record's FR3 owns the prebuilt and PostCSS data-group availability
guarantees. Beyond that guarantee, `spec:AST-080` governs `@astryxdesign/build`.

## Verification

| Contract  | Verification                                                                                     | Representative states                                                                                                                                                                            | Mutation or failure expectation                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3   | generator drift, public export, graph-aware compiler, PostCSS integration, and package CSS tests | graph-based source graphs without imports; PostCSS build without a `dataVars` import, development and production; prebuilt Core; one retained member; cross-package provider pair; raw/gzip size | plain defaults drift; public key changes; unused graph-based source emits data vars; prebuilt Core or PostCSS build omits or changes any; one use emits fewer/more than 56; duplicate group |
| FR4–FR5   | source audit, compiler fixture, component tests, real Chromium                                   | direct SVG fill/stroke; DOM style; Canvas concrete resolution; explicit props; canonical green/red; authored override                                                                            | literal construction remains; direct CSS value does not retain definitions; Canvas receives `var()`; body paints black or wick disappears                                                   |
| FR6–FR7   | runtime/static/family structure and layer-order tests                                            | zero/one/many authored names; all 56 canonical names; `:root`/html/body scan; theme CSS before/after component CSS                                                                               | omitted default serialized; authored value outside donut; raw defaults remain; layer order flips                                                                                            |
| FR8–FR11  | real-browser cascade matrix                                                                      | same/different nesting; parent/child subsets; siblings; dynamic switch; light/dark/system/MediaTheme; portals; layered and unlayered source CSS                                                  | omission resets; sibling leaks; order/mode changes winner; unlayered root silently claims override parity                                                                                   |
| FR12–FR16 | compiler/runtime/build parity and environment-policy tests                                       | no data consumer; retained layered group; runtime and built themes; standalone and family color-scheme composition                                                                               | Theme presence emits defaults; built/runtime differ; family repeats defaults; global policy diverges                                                                                        |
| FR17–FR20 | Changeset, codemod, CLI check, docs, and regeneration fixtures                                   | literal component/fixture use; raw CSS with/without fallback in prebuilt and source builds; old root artifact; ordinary/family build                                                             | no breaking note; unsafe auto-rewrite; stale artifact passes; raw use fails upgrade; docs claim theme CSS supplies defaults or token-granular pruning                                       |

Real-browser verification MUST independently assert canonical and authored values,
not reuse generator output as the oracle. It MUST reproduce the
black-body/invisible-wick state with the variable declaration removed, then prove
correct SVG fill and stroke after the public StyleX import. It MUST cover default,
explicit prop, parent override, child subset override, same/different nested
identity, siblings, dynamic switching, light/dark values, and portal content that
inherits from the document root. Non-CSS verification MUST resolve the same
canonical and authored colors through the JavaScript token API and assert that a
Canvas assignment never receives a `var()` reference. An unlayered StyleX output
MUST be a red arm: it must demonstrate why the supported integration wraps
canonical defaults in `astryx-base` rather than being reported as equivalent.

Compiler verification MUST compile an unused entry and a one-member consumer
through a graph-based pipeline. The unused output contains zero
`--color-data-*` defaults; the retained output contains every canonical name
exactly once in the StyleX variable group. It MUST not claim per-property
pruning. PostCSS integration verification MUST run the documented configuration
over a product that does not import `dataVars`, in development and production
modes, and compare the output with the canonical source: every name and value
exactly once, declared on `:root` inside `@layer astryx-base`. Distribution verification MUST prove Core's
prebuilt stylesheet defines all 56 canonical values exactly once and a
satellite/provider pair does not duplicate the group. A production application
using only the prebuilt CSS and the compiled public `dataVars` entry MUST paint
canonical and authored values in both light/dark modes and both stylesheet load
orders. Report raw and gzip deltas for the retained group.

Theme-output verification MUST enumerate all 56 canonical names and fail if an
un-authored canonical value appears in standalone, multi-file, family, or runtime
Theme CSS. It MUST fail on any raw `:root` data declaration from theme build and
on removal of the explicit `reset, astryx-base, astryx-theme` order registration.
Global color-scheme verification separately compares the complete standalone
three-rule policy across representative emitting bundles, asserts that a
non-emitting standalone bundle contains none of the three, and preserves existing
family composition.

### Completion criteria

Conformance requires:

- one canonical `.stylex.ts` source, a public `dataVars` export, and generated
  compatibility/type/validation views;
- truthful whole-group tree-shaking in graph-based source builds, the complete
  group in PostCSS integration output, and the explicit prebuilt-Core
  availability guarantee, with dependency-aware satellite deduplication;
- migrated Astryx consumers with no constructible raw data-var strings;
- sparse donut overrides and zero theme-build raw defaults across runtime,
  standalone, multi-file, and family modes;
- JS token API and theme-input compatibility;
- real Chromium SVG/cascade evidence, including the undeclared-variable red arm;
- regeneration and migration evidence for downstream theme artifacts; and
- independent architecture review plus green CI.

## Decision log

### DEC-1 — Public StyleX variables own canonical CSS defaults

**Reference:** `spec:AST-066/DEC-1`
**Decider:** `cixzhang`, `2026-10-01`

The data palette joins the canonical StyleX token system. The checked-in
`.stylex.ts` module owns the names and defaults, and components import its public
object with stable CSS names. Plain JavaScript defaults, types, validation, and
documentation remain generated compatibility views, not a second hand-maintained
authority.

Rejected: preserving `dataTokenDefaults` as an independent CSS generator input.
That is the parallel metadata architecture that allowed consumers and emitted CSS
to disagree.

### DEC-2 — Tree-shake one semantic 56-variable group

**Reference:** `spec:AST-066/DEC-2`
**Decider:** `cixzhang`, `2026-10-01`

StyleX 0.19 emits a complete `defineVars` group when its module is retained and
cannot prune individual object properties. One data palette group matches the
existing `colorVars` model, keeps the public API coherent, and gives an honest
source-compiled zero-or-56 boundary. Precompiled package CSS remains graph-aware
across packages, with the explicit Core distribution exception in FR3; it does
not use a repository-wide file scan. DEC-10 scopes the boundary to graph-based
source builds.

Rejected: claiming token-granular pruning, or splitting the palette across many
files solely to simulate it. Both would make the API and maintenance cost exceed
the demonstrated compiler capability.

### DEC-3 — Theme output contains authored deltas only

**Reference:** `spec:AST-066/DEC-3`
**Decider:** `cixzhang`, `2026-10-01`

Theme build owns customization, not canonical availability. It serializes only
explicit data inputs in the normal donut and never emits a raw root defaults
block. It preserves a declaration-only layer prelude so removing that block does
not invert `astryx-base` and `astryx-theme` when CSS load order changes.

Rejected: copying 56 defaults into every theme and keeping one unconditional
root block. The former duplicates defaults; the latter makes Theme presence,
not actual StyleX use, own the palette.

### DEC-4 — Nested omission inherits

**Reference:** `spec:AST-066/DEC-4`
**Decider:** `cixzhang`, `2026-10-01`

Same and different nested themes inherit every unspecified custom property and
replace only the authored subset. Identity alone is not a palette reset.

Rejected: treating an omitted value as an authored request for the canonical
default.

### DEC-5 — Accept standard StyleX root emission when the group is retained

**Reference:** `spec:AST-066/DEC-5`
**Decider:** `cixzhang`, `2026-10-01`

`stylex.defineVars(defaults)` emits its group on `:root` plus a variable-group
class. This is the same canonical mechanism as existing token groups. The strict
boundary in this decision is therefore ownership: unused graph-based source
graphs emit nothing, Core distribution and the PostCSS integration retain the
group under FR3 (DEC-10), and theme build never emits data defaults globally.

Rejected: promising that retained canonical StyleX variables are absent from
unthemed DOM. Standard `defineVars` cannot make that promise; a manually scoped
parallel declaration or unconditional Theme class would contradict the chosen
source-of-truth and tree-shaking model.

### DEC-6 — Keep JavaScript resolution compatibility

**Reference:** `spec:AST-066/DEC-6`
**Decider:** `cixzhang`, `2026-10-01`

Existing resolver names, shapes, and mode behavior remain available from a
generated compatibility view. This lets CSS ownership change without forcing
callers that already need concrete values onto a DOM computed-style API.

Rejected: deleting `dataTokenDefaults` or changing `useTheme` into a cascade
reader. Neither is required to fix CSS ownership.

### DEC-7 — Keep one compatible global color-scheme policy

**Reference:** `spec:AST-066/DEC-7`
**Decider:** `cixzhang`, `2026-10-01`

The three root/html rules intentionally configure browser-wide `light-dark()`
and UA behavior. Complete theme bundles may repeat them when identical, or omit
the complete set. Tests prevent specialization or partial emission.

Rejected: scoping or splitting color-scheme packaging.

### DEC-8 — Migrate through an atomic stack and breaking minor

**Reference:** `spec:AST-066/DEC-8`
**Decider:** `cixzhang`, `2026-10-01`

The implementation separates canonical public StyleX ownership, consumer
migration, and theme-generator cleanup so each review has one reason to change.
The release uses a breaking 0.x minor with regeneration and consumer diagnostics.

Rejected: a legacy global-data mode. It would keep new artifacts on the behavior
this decision removes and make runtime/static ownership mode-dependent.

### DEC-9 — Prebuilt Core CSS defines the public data-variable entry

**Reference:** `spec:AST-066/DEC-9`
**Decider:** `cixzhang`, `2026-10-20`

The prebuilt public `dataVars` entry contains CSS `var()` references with no
surviving `defineVars()` call. A prebuilt-CSS consumer cannot retain defaults by
importing that already-compiled object. Core's stylesheet therefore includes the
single canonical group, like its other public token defaults. Graph-based
source compilation retains the zero-or-56 rule (DEC-10); themes contain only
authored deltas. The fixed
cost is one group of 56 declarations, not a second source or a new runtime mode.

Rejected: requiring prebuilt consumers to compile the source token entry, because
it defeats the prebuilt-CSS contract and its documented import path.

### DEC-10 — Source builds read data colors through `dataVars`

**Reference:** `spec:AST-066/DEC-10`
**Decider:** `cixzhang`, `<pending>`

Raw `var(--color-data-*)` strings are the prebuilt path: Core's stylesheet
defines the group (FR3, DEC-9). A source build reads data colors through
`dataVars`, which retains the group in a graph-based pipeline and keeps DEC-2's
zero-or-56 boundary there. The `@astryxdesign/build` PostCSS integration
compiles every module Core publishes, so its output always carries the complete
group in `astryx-base`. This decision scopes DEC-2's source boundary and DEC-5's
unused-graph rule to graph-based source builds. Upgrade tooling requires no
fallback for raw consumers (FR18); raw strings in a graph-based source build
without a `dataVars` import are unsupported (FR4).

Rejected: an upgrade check that infers the build mode and requires fallbacks,
since no project signal reliably separates prebuilt from source builds.

## Deprecation and cleanup records

### IFIX-0009 — Themes stop emitting raw global data-color defaults

| Field         | Value                                                                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id            | `IFIX-0009`                                                                                                                                                                                                                                                 |
| cleanup       | `CLN-0016`                                                                                                                                                                                                                                                  |
| package       | `@astryxdesign/core`, `@astryxdesign/cli`                                                                                                                                                                                                                   |
| surface       | The unscoped raw `:root` block of canonical data-color defaults that `Theme` runtime and `theme build` (standalone and family) emit for every theme                                                                                                         |
| authority     | FR6 (concrete themes emit only explicitly authored data values), FR7 (theme build never emits raw global data defaults), and FR12 (availability follows compilation mode, not Theme presence). Owners: `spec:AST-066`: `cixzhang`                           |
| reproducer    | With the latest stable packages, a theme that authors no data colors emits every canonical data default in an unscoped root block, in runtime CSS and in `theme build` output                                                                               |
| affected      | CSS that reads a raw data-color custom property directly, relying on a theme to define it, without compiling a `dataVars` consumer; and stale generated theme CSS checked into an app                                                                       |
| matrix        | Theme with no authored data colors: every canonical default before; none after. Authored override: emitted before and after, scoped to its theme. StyleX `dataVars` consumers: same painted values before and after. Global `color-scheme` rules: unchanged |
| coexistence   | The public `dataVars` group supplies canonical values through retained source compilation or the prebuilt Core stylesheet; a compiled import alone does not emit CSS.                                                                                       |
| migration     | Read data colors through the public `dataVars` group, or author the needed values in the theme. Regenerate built theme CSS                                                                                                                                  |
| codemod       | `astryx upgrade` runs a validator that rejects stale generated CSS; direct raw consumers need no codemod                                                                                                                                                    |
| downstream    | Maintained docs and templates read data colors through `dataVars`                                                                                                                                                                                           |
| rollback      | Restore the raw default block in runtime and `theme build` output from the final-patch baseline                                                                                                                                                             |
| harm of delay | Every theme keeps shipping a second global palette that survives without any consumer and can disagree with the canonical StyleX group                                                                                                                      |
| harm of apply | CSS that reads a raw data variable without `dataVars` or an authored value paints with the variable unset until it migrates                                                                                                                                 |
| transition    | no prior transition                                                                                                                                                                                                                                         |
| state         | `proposed`                                                                                                                                                                                                                                                  |
| open decision | None beyond approving this proposed record and its cleanup                                                                                                                                                                                                  |

### CLN-0016 — Remove raw global data-color defaults from theme output

| Field     | Value                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| id        | `CLN-0016`                                                                                                                                         |
| lifecycle | `IFIX-0009`                                                                                                                                        |
| delta     | Runtime and built themes emit only authored data values, scoped to their theme. Explicit layer order and global `color-scheme` rules are unchanged |
| rollback  | Restore the raw default block from the final-patch baseline                                                                                        |
| state     | `pending` — lands in a declared minor with its `[breaking]` Changeset                                                                              |

## Open questions

None.
