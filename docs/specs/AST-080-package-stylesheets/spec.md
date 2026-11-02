---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-080
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:component-style-authoring]
affects_families: []
affects_contributing: []
affects_consumer_docs: [styling-overview, getting-started, migration-setup]
---

# Package stylesheet distribution system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A product that uses Astryx loads prebuilt stylesheets: `@astryxdesign/core/astryx.css`,
the stylesheet of each other Astryx package it uses, and a theme stylesheet.
Those files are the whole of Astryx's component CSS, and loading them is the
default setup. A product can instead compile Astryx package source with
`@astryxdesign/build`, for every module of a package or only the ones it ships;
that build produces the rules the prebuilt stylesheets hold, in the same layer.
A Next.js product does this with `withAstryx()` under webpack or Turbopack, for
every styled Astryx package it uses, and its own CSS still wins over every
Astryx rule.

Every package stylesheet places its rules in the same cascade layer under the
same layer order. A theme override therefore wins over the base styles of every
package, whichever package styled the element and whichever stylesheet loads
first.

## Non-goals

- What a theme stylesheet contains, owned by `architecture:theme-compilation`,
  `spec:AST-034`, and `spec:AST-050`.
- Which StyleX variable groups a package stylesheet contains, owned by
  `spec:AST-066` FR3.
- How a product compiles its own code, including any StyleX settings it uses for
  its own styles or for components it ejects with `astryx swizzle`.
- How `@astryxdesign/build` plugs into a bundler other than through
  `withAstryx()` (FR9), and how a source build chooses a subset of a package's
  modules to compile.
- Minifying or compressing stylesheets.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Every published package ships one prebuilt stylesheet.** Each
  published `@astryxdesign/*` package whose modules carry styles MUST export one
  precompiled stylesheet from a `.css` subpath of the package. The stylesheet
  holds every rule its modules use. A package ships its stylesheet with its
  first published release that carries styles. The package stylesheets are:

  | Package                  | Stylesheet                                                          |
  | ------------------------ | ------------------------------------------------------------------- |
  | `@astryxdesign/core`     | `@astryxdesign/core/astryx.css`                                     |
  | `@astryxdesign/lab`      | `@astryxdesign/lab/lab.css`                                         |
  | `@astryxdesign/richtext` | `@astryxdesign/richtext/richtext.css`                               |
  | `@astryxdesign/charts`   | `@astryxdesign/charts/charts.css`, from its first published release |

  Theme packages are outside this requirement; their stylesheets follow the theme
  records named in Non-goals.

- **FR2 — Prebuilt stylesheets are complete without a compiler.** Loading a
  package's stylesheet with `astryx.css` and a theme stylesheet MUST style every
  element the package renders, in every state, color scheme, and text direction
  the package supports, with no StyleX compiler in the product's build. A non-Core
  stylesheet relies on `astryx.css` for the Core definitions it declares, such
  as variable groups and keyframes, and does not repeat a definition
  `astryx.css` declares. A Core group that `astryx.css` omits under
  `spec:AST-066` FR3 is carried by the package stylesheet whose modules read it.

- **FR3 — One layer and one layer order in every package stylesheet.** Every rule
  in every package stylesheet, and in Core's `reset.css`, MUST sit inside its one
  Astryx layer: `astryx-base` for package stylesheets and `reset` for
  `reset.css`. None of these files emits an unlayered rule or another layer. Each
  begins with the same order registration that theme output carries under
  `spec:AST-066` FR7:

  ```css
  @layer reset, astryx-base, astryx-theme;
  ```

  So `reset < astryx-base < astryx-theme` holds whatever Astryx stylesheet loads
  first, and an authored theme override wins over the base rule of every package.
  A product's unlayered CSS stays above every Astryx layer.

- **FR4 — The stylesheet survives bundling.** Each package's `exports` MUST
  resolve its stylesheet subpath in the packed package, and its `sideEffects`
  declaration MUST cover that file, so a bundler keeps the product's
  `import '@astryxdesign/<package>/<name>.css'`.

- **FR5 — Documented setups load prebuilt stylesheets by default.** Each
  default consumer setup path in the documentation (plain CSS, Tailwind, and a
  product that compiles its own StyleX, including ejected components) MUST load
  the prebuilt stylesheet of every Astryx package the product uses, except a
  package compiled from source under FR9, whose rules come from the product's
  compiled output and whose prebuilt stylesheet the build neither imports nor
  bundles, plus a theme stylesheet, and the documentation MUST present those
  paths as the default. A
  default setup looks like:

  ```css
  @layer reset, astryx-base, astryx-theme;

  @import '@astryxdesign/core/reset.css';
  @import '@astryxdesign/core/astryx.css';
  @import '@astryxdesign/richtext/richtext.css'; /* each package used */
  @import '@astryxdesign/theme-neutral/theme.css';
  ```

  The documentation MAY also present a source build as an alternative to a default
  setup: the source of one or more packages compiled through `@astryxdesign/build`
  under FR7 (and FR9 for `withAstryx()`), each in place of that package's
  prebuilt stylesheet, while the
  product keeps loading Core's `reset.css`, a theme stylesheet, and the prebuilt
  stylesheet of every package it does not source-build. No documented setup loads
  a package's prebuilt stylesheet and also compiles that package's source, or
  compiles Astryx source any other way, such as adding Astryx package source to
  the product's own StyleX compiler inputs.

- **FR6 — Every package documents its import.** Each package's README and the
  styling overview MUST name the package's stylesheet and show the import beside
  `astryx.css`.

- **FR7 — A source build produces what the prebuilt stylesheet holds.** A source
  build of a package MUST produce, for the modules it compiles, the same rules
  with the same selectors in the same order as that package's prebuilt stylesheet,
  every one inside one `@layer astryx-base` with no nested layer. Each package
  block a source build emits begins with the FR3 order registration, so the order
  holds whichever Astryx file or chunk loads first and never depends on a line
  the product writes. Compiling every module of a package
  reproduces its prebuilt stylesheet's rules; compiling a subset produces the
  rules those modules use. A source build of Core always includes the Core
  definitions other packages' prebuilt stylesheets rely on under FR2, such as
  variable groups and keyframes. Product rules stay outside `astryx-base`. A
  source build needs no data beyond the package's own source, and holds in
  development builds as in production builds.

- **FR8 — Stylesheet growth is reported and budgeted per component.** Every
  product that loads a package's prebuilt stylesheet loads all of it (FR1), so
  CSS a component adds reaches each of those products, including products that
  never render it. Every pull
  request that changes a package's styled modules MUST report, base against
  head, the gzip size of each package stylesheet it changes and the gzip CSS
  delta of each component that changed. A feature that runs only on a coarse
  pointer and adds more than 1 KB gzip of CSS to one component is flagged, and
  its pull request justifies that cost; the CSS stays in the package
  stylesheet (FR1, FR2). Sizes are gzip at the default compression level, and
  1 KB is 1,024 bytes. A component's CSS delta is the gzip size of the rules its
  modules contribute to the package stylesheet at head minus the same at base.
  The matching JavaScript report and budget, and the
  rule that a shared value table ships only the rows a component uses, are
  `architecture:component-style-authoring` INV6.

- **FR9 — `withAstryx()` compiles every styled package from source, in order.**
  `withAstryx()` from `@astryxdesign/build/next` MUST build from source, under
  webpack and under Turbopack, every published Astryx package with styled
  modules that the product uses: the FR1 packages, Core, Rich Text, Lab, and
  Charts (from its first published release). Theme packages keep their prebuilt
  theme stylesheets.
  - **Real source.** Each source-built package's rules come from compiling that
    package's own source in the product's build, with the settings its prebuilt
    stylesheet is compiled with (FR7); the product's own StyleX settings never
    apply to Astryx source. The build neither imports nor bundles the prebuilt
    stylesheet of a package it compiles from source, and it fails rather than
    take a rule from that stylesheet.
  - **Ordering.** Every Astryx rule sits inside
    `@layer reset, astryx-base, astryx-theme`: Core's `reset.css` in `reset`,
    each package's compiled block in `astryx-base`, and the theme in
    `astryx-theme`. Each compiled block begins with the FR3 order registration
    (FR7). Product CSS, including the product's own StyleX output, stays
    unlayered and wins over every Astryx rule in any chunk or load order. A
    non-Core block relies on Core's variables and keyframes as under FR2.
  - **Fast path (Turbopack goal, known gap).** The goal is that Astryx modules
    compile inside Turbopack's native pipeline: no `turbopack.rules`
    JavaScript loader, no Babel, and no PostCSS step compiles an Astryx module,
    and Astryx rules reach the page through Turbopack's own CSS handling. No
    maintained StyleX compiler runs inside that pipeline, so until one exists the
    Turbopack build MAY compile Astryx modules through a `turbopack.rules`
    JavaScript loader that runs Babel with the StyleX Babel plugin. Every other
    FR9 rule holds on that route.
  - **Speed budget (Turbopack).** Against the same app built without source
    compilation (loading the prebuilt stylesheets), median of five runs:
    `next dev` cold start at most +15%, a hot update at most +10%, and
    `next build` at most +20%. The figures are measured and reported on every
    change to the build package. The budget does not block while the loader
    route is in use; it becomes a requirement once a native route exists.
  - **Webpack.** The webpack source build meets the real-source and ordering
    rules; the fast-path goal and the speed budget apply to Turbopack only.

### Platform support

- Supported feature/engine floor: unchanged; cascade layers are already required
  by the theme and reset stylesheets.
- Unsupported behavior: none added.
- Browser evidence: real-browser computed styles for FR2, FR3, FR7, and FR9.
  FR1, FR4,
  FR5, and FR6 are proven at the package, bundler, and documentation layer. FR8
  is proven by the pull-request size report.

## Current-state impact

- Core, Lab, Rich Text, and Charts already export one stylesheet each with every
  rule inside `@layer astryx-base`. Non-Core stylesheets omit the Core variable
  groups `astryx.css` declares. Core's prebuilt stylesheet carries the canonical
  data-token group; Lab relies on that stylesheet and adds no copy, under
  `spec:AST-066` FR3.
- `reset.css` and every package stylesheet (`astryx.css`, `lab.css`,
  `richtext.css`, `charts.css`) begin with the FR3 order registration, so the
  prebuilt files hold the order in any load order.
- Core, Lab, Rich Text, and Charts each declare `sideEffects` covering
  `**/*.css` (FR4).
- The styling overview documents only the prebuilt path. A source build through
  `@astryxdesign/build` is not yet documented there (FR5).
- `@astryxdesign/build` conflicts with FR7: it processes Astryx rules into nested
  priority layers inside `astryx-base`; it compiles Astryx modules with an
  `astryx` class-name prefix where the prebuilt stylesheets use StyleX's default
  `x`; its Vite build's Lightning CSS pass and its PostCSS helper's Autoprefixer
  pass add `-webkit-` declarations the prebuilt stylesheets lack; its Vite plugin
  injects its own layer-order registration, with a `product` layer, into each
  page; and nothing makes a Core source build carry the Core definitions that
  prebuilt `lab.css` relies on. Conforming changes the class names and layers it
  emits for its current users.
- `withAstryx()` does not yet meet FR9 (implementation gaps): it refuses
  Turbopack builds; under webpack it source-builds Core and Lab, while Rich Text
  and Charts stay on their prebuilt stylesheets; and a source build emits no
  order registration in its own output (FR7), relying on `reset.css`, the theme,
  or the product's line. No fixture checks FR9 and no speed figures are
  reported. Rich Text and Charts already publish `source` export conditions.
- Under Turbopack no maintained StyleX compiler runs in the native pipeline, so
  the FR9 fast path is a goal with a known gap: the Turbopack route compiles
  Astryx modules through a JavaScript loader running Babel and the StyleX Babel
  plugin, and the speed budget is reported rather than enforced.

- Lab, Rich Text, and Charts document their stylesheet only in their READMEs;
  the styling overview's import table lists only Core (FR6).
- The pull-request size report measures no stylesheet, so no CSS size or
  delta is reported, and no touch-only CSS is flagged (FR8). Its JavaScript
  figure is a component's re-export file rather than what its import pulls in,
  its before and delta columns are always empty, and nothing flags touch-only
  JavaScript (`architecture:component-style-authoring` INV6).
- The `styling-overview`, `getting-started`, and `migration-setup` consumer docs
  change. Package stylesheet rules and class names are otherwise unchanged.

## Verification

| Contract | Verification                                                                                           | Representative states                                                                                                                                                                                                                                                                                                                                                                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | package manifest and stylesheet build tests                                                            | every published package with styled modules; a module's rules in its package stylesheet                                                                                                                                                                                                                                                                                                                                           | a styled published package has no `.css` export; a rule a module uses is missing                                                                                                                                                                                                                                                                                                   |
| FR2      | real-browser computed styles with no StyleX compiler                                                   | a representative component from each package; default, hover, focus, disabled, dark, and right-to-left                                                                                                                                                                                                                                                                                                                            | removing the package stylesheet changes a computed style; a non-Core stylesheet repeats a group `astryx.css` declares                                                                                                                                                                                                                                                              |
| FR3      | stylesheet structure tests and real-browser cascade                                                    | each package stylesheet and `reset.css`; theme first and last; package stylesheets in either order; `reset.css` last; a theme override                                                                                                                                                                                                                                                                                            | an unlayered rule or another layer; a missing or reordered registration; the theme override loses in any load order                                                                                                                                                                                                                                                                |
| FR4      | packed-package and bundler fixtures                                                                    | each package's stylesheet import in a production bundle                                                                                                                                                                                                                                                                                                                                                                           | the subpath does not resolve from the packed package; the bundle drops the stylesheet                                                                                                                                                                                                                                                                                              |
| FR5–FR6  | consumer-doc checks                                                                                    | every setup snippet in the styling overview, getting started, and migration setup; each package README                                                                                                                                                                                                                                                                                                                            | a default setup omits `astryx.css` or a used package stylesheet; a setup loads a prebuilt stylesheet and compiles the same package's source; a package import is missing                                                                                                                                                                                                           |
| FR7      | build-package compile tests and real-browser cascade                                                   | every Core module compiled through the build package; a subset of modules; a development build; Core source-built beside a prebuilt Lab stylesheet; a source-built component under a theme override                                                                                                                                                                                                                               | the every-module compile differs from the prebuilt rules or order; an Astryx rule sits in a nested or other layer; the theme override loses                                                                                                                                                                                                                                        |
| FR8      | pull-request size report against base                                                                  | a component whose styles change; a touch-only feature adding 0.9 KB and 1.1 KB gzip CSS to one component; a pull request with no styled change                                                                                                                                                                                                                                                                                    | a changed package stylesheet or component with no base-against-head gzip figure; a touch-only feature over 1 KB gzip CSS per component that is not flagged                                                                                                                                                                                                                         |
| FR9      | Next.js fixture app under Turbopack and webpack, real-browser computed styles, build trace and timings | a fixture app importing Core, Rich Text, Lab, and Charts, built with `next dev` and `next build` under each bundler; per package, a product class and a product StyleX rule over a base rule, and a theme over a base rule; chunk order reversed and the product's order line removed; every prebuilt package stylesheet deleted from the installed packages before the build; speed against the same app on prebuilt stylesheets | a product override or a theme loses; a deleted prebuilt stylesheet breaks the build or changes a computed style; the emitted selectors differ from the source compile; a package's compiled block lacks the order registration; speed figures are missing (exceeding the budget fails only once a native Turbopack route exists, and the loader count on Astryx files is reported) |

The real-browser cascade check uses a component whose theme changes its base
colors, such as a theme that restyles the destructive Button, and asserts the
theme's colors in every load order.

## Decision log

### DEC-1 — Prebuilt stylesheets are the default; a source build compiles the same way

**Reference:** `spec:AST-080/DEC-1`
**Decider:** `cixzhang`, `2026-10-15`

Most products need no compiler for Astryx, so the prebuilt stylesheets stay the
default and every default setup works without one. A product that wants
only the CSS of the modules it ships can compile Astryx source through
`@astryxdesign/build`. A second compile breaks theme overrides when it adds a
second copy of the rules beside the prebuilt stylesheet, or compiles them with
other settings or into another layer. A source build replaces the package's
stylesheet and compiles it the way the prebuilt stylesheet is compiled, into the
same single layer, so the cascade the package ships and tests holds.

Rejected: forbidding a source build, which leaves a product no way to load only
the CSS it uses; and removing rules from a prebuilt stylesheet with data shipped
beside it, which adds a format to maintain and a second way to build the same
rules.

### DEC-2 — Every package shares one layer and one order registration

**Reference:** `spec:AST-080/DEC-2`
**Decider:** `cixzhang`, `2026-10-15`

A theme override targets a component, not the package that ships it, so every
package's base rules sit in `astryx-base`. Each stylesheet registers the order
itself so it never depends on the product's first line.

Rejected: a layer per package, because theme layer order would then depend on
which packages a product loads.

### DEC-3 — Each package ships one whole stylesheet

**Reference:** `spec:AST-080/DEC-3`
**Decider:** `cixzhang`, `2026-10-15`

One file per package keeps setup to one import per package and works in every
framework.

Rejected: stylesheets imported by component modules, because some frameworks do
not load stylesheets that dependency modules import.

### DEC-4 — Component size is reported on every change and budgeted for touch-only work

**Reference:** `spec:AST-080/DEC-4`
**Decider:** `cixzhang`, `2026-10-24`

Because each package's prebuilt stylesheet ships whole (DEC-3) and is the
default setup (DEC-1), CSS for a feature only touch devices use still costs
every desktop product on that setup, and nobody sees the
cost unless each change reports it. A per-component report on every pull
request makes growth visible, for the JavaScript a component's import pulls in
as for its CSS. Touch-only work is flagged at 2 KB gzip of JavaScript or 1 KB
gzip of CSS per component: JavaScript can load lazily, only when a coarse
pointer needs it, or be justified, and CSS, which stays in the stylesheet, is
justified. A shared JavaScript value table ships to a component only the rows it
uses, so one component's tuning does not ride along with every other import.

Rejected: splitting touch-only CSS into a separate stylesheet, because it
breaks the one-import setup DEC-3 keeps.

### DEC-5 — Touch JavaScript comes from the shared internal touch modules

**Reference:** `spec:AST-080/DEC-5`
**Decider:** `cixzhang`, `2026-10-26`

Touch primitives over the budget come from the shared internal touch modules
components import (`architecture:react-component-runtime` INV13), which a
page carries once, or the cost is justified; a component does not lazy-load
its own. There is no install step: the modules are always present. This
supersedes DEC-4's lazy-load remedy; its reporting and budget stand.

Rejected: lazy loading inside each component, and an app-installed module.

### DEC-6 — Source builds cover Turbopack and every styled package; the fast path is the goal

**Reference:** `spec:AST-080/DEC-6`
**Decider:** `cixzhang`, `2026-11-01`

Next.js builds with Turbopack by default, so `withAstryx()` supports it as well
as webpack, for every styled package including Rich Text and Charts. Support
means a real compile of package source with Astryx ordering guaranteed against
product styles, not a wrapper around the prebuilt stylesheets. Ideally the
Turbopack build stays on Turbopack's native pipeline; no maintained StyleX
compiler runs there, so a loader route is accepted with that gap recorded and
the speed budget reported until a native route exists.

Rejected: keeping Turbopack unsupported, which leaves products on the default
bundler without a source build.

## Open questions

None.
