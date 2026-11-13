# @astryxdesign/build

# 0.7.15

---

# 0.7.14

---

# 0.7.13

#### Fixes

- dependency floors move to current releases: the build package needs autoprefixer 10.6.2, browserslist 4.29.5 and lightningcss 1.33.0; the CLI needs ignore 7.0.14, jscodeshift 17.4.0, linkedom 0.18.15, zod 4.6.7 and @stylexjs/babel-plugin 0.19.1; each theme needs lucide-react 1.66.0. Peer ranges do not change. (#10709)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.7.12

#### Fixes

- A swizzled copy can now compile as Astryx source in the Babel, PostCSS, and Vite integrations. Every module under a folder that holds an `astryx-swizzle.json` marker gets the library class prefix and lands in `@layer astryx-base`, below `astryx-theme`, so a theme's component overrides reach it. `astryx swizzle` does not write the marker yet: add the file to the swizzle output folder. Under webpack, `withAstryx()` rebuilds a cached copy when its marker appears or disappears. Turbopack builds do not read the marker yet. No API changes. (#10334)
- `astryx swizzle` writes an `astryx-swizzle.json` marker into an output folder it owns (one the copy creates, an empty one, or one it marked before), naming each package the folder's copies came from and its version. `@astryxdesign/build`'s Babel, PostCSS and Vite integrations, and `withAstryx()` under webpack, compile the copies under that folder below `astryx-theme`, so a theme's component overrides reach a swizzled component as they reach the package component. For a folder that already holds other files it writes no marker and says what it found and how to add the marker by hand; the `swizzle.copy` receipt reports this in a new optional `marker` field. Under Turbopack and with the stock StyleX plugins, a copy's styles still land above the theme. The marker is not listed among the copy's files. (#10483)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.7.11

---

# 0.7.10

---

# 0.7.9

---

# 0.7.8

---

# 0.7.7

#### New Features

- `withAstryx()` builds Astryx from source under Turbopack instead of refusing to. It points each package's documented entry points at their source (Core, Lab, Charts and Rich Text), compiles that source with the settings the prebuilt stylesheets use, and keeps the app's own Turbopack rules off it. The new PostCSS plugin `@astryxdesign/build/next/postcss` replaces an `@astryx;` rule with each source-built package's prebuilt stylesheet, compiled from that source: the same rules and selectors, in the same order, inside `@layer astryx-base`. To set it up, list `@astryxdesign/build/next/postcss` in the app's PostCSS config and put one `@astryx;` rule in the app's global stylesheet (option `cwd`, the app root, defaults to the working directory). Under Turbopack, the webpack setup's `@astryxdesign/build/postcss` refuses to run beside `withAstryx()`, since its rules never match the classes Turbopack renders. In this source build, an installed Astryx package with a malformed `package.json` fails the build instead of being left out. The webpack setup is unchanged: it builds Core and Lab from source, and Rich Text and Charts keep their prebuilt stylesheets there.

#### Other Changes

- The prebuilt stylesheet build and the Turbopack source build share one module walk, compile and layer block, so a source build prints the prebuilt rules by construction. Every prebuilt stylesheet keeps its bytes.

#### Contributors

Thanks to everyone who contributed to this release:

- @vjeux

---

# 0.7.6

#### New Features

- A production build with `astryxStylex` warns when its stylesheet reads a StyleX-generated custom property that nothing declares, naming the variable and the rule that reads it. It checks the class-name prefixes the build uses, `stylexOverrides.classNamePrefix` included, and never reports a custom property an app declares in its own CSS. (#8075)

#### Fixes

- `astryxStylex` resolves `defineConsts` values read from another file. With the `{stylexOptions}` form (the one Storybook uses), a file that read only constants from a `.stylex.ts` module lost that import once StyleX compiled it, so the constants never reached the CSS: a constant used as a media-query key failed the build ("Invalid empty selector") and one used as a value shipped as a custom property nothing declares. In either form, a constant defined on the other side of the layer split, or in an Astryx package (compiled with the library class-name prefix) and read from an app file (compiled with its own), stayed unresolved. (#8075)
- Published packages no longer include repository test and benchmark files, reducing install size without changing exports. (#9153)

#### Documentation

- The Next.js setup in the README says that its Babel config turns off SWC, which `next/font` needs, so a fresh `create-next-app` layout must drop its `next/font` import before the webpack source build will compile. (#9439)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @parinith-web
- @vjeux

---

# 0.7.5

#### Documentation

- Package links now point to the project's GitHub home, `meta/astryx`.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.7.4

---

# 0.7.3

---

# 0.7.2

#### Fixes

- `withAstryx()` builds again under pnpm's default isolated layout. It no longer turns off webpack's symlink resolution, which hid each Astryx package's own dependencies (`Can't resolve 'intl-messageformat'`, `'lucide-react'`). Astryx modules are still matched by their real path, so a workspace-linked package keeps resolving its `source` entries.
- The PostCSS plugin now scans what each installed Astryx package publishes (its `files` field, or the whole package minus nested `node_modules` when it has none) instead of everything under `node_modules/@astryxdesign`. A package linked from a workspace no longer drags in its own `node_modules`, whose links can cycle back to it and made the build run out of memory, or its unpublished test fixtures. Registry installs scan the same files as before.

#### Performance

- The PostCSS plugin no longer loads the app's root Babel config when it compiles Astryx source. In the documented Next.js setup that config (`next/babel` plus Astryx's StyleX plugin) ran over every installed Astryx module on each build only for the plugin to read StyleX metadata, roughly doubling the CSS pass. The emitted CSS is unchanged, and the app's own files still compile with its config.

#### Contributors

Thanks to everyone who contributed to this release:

- @vjeux

---

# 0.7.1

---

# 0.7.0

#### Fixes

- Preserve native `light-dark()` token values in Vite source builds by defaulting Lightning CSS to Astryx's supported browser floor. (#7330)

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.6.8

---

# 0.6.7

---

# 0.6.6

---

# 0.6.5

---

# 0.6.4

#### Fixes

- Keep PostCSS and Vite processing inside `@astryxdesign/build`'s declared dependency boundary (#6605)
  Packed consumers no longer depend on workspace hoisting to find PostCSS helpers or CSS compatibility processors. The package now owns Autoprefixer, Browserslist, and Lightning CSS, and a clean isolated-install test exercises the published tarball's PostCSS helper and Vite output.
- Make source builds fail on unsupported StyleX declarations and load shared StyleX output from every Vite HTML entry.
  Nested pseudo-elements and `stylex.keyframes()` now have production-build regression coverage, and the maintained capability registry tracks the installed StyleX version.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.6.3

---

# 0.6.2

---

# 0.6.1

---

# 0.6.0

#### Fixes

- `withAstryx()` refuses a Turbopack config instead of building an unstyled app. Every alias the helper installs lives in `nextConfig.webpack`, which Turbopack never calls, so the app resolved `@astryxdesign/*` to dist while PostCSS compiled the library from source — disjoint class names, an exit code of 0, and an unstyled page. It now throws, naming both ways out: `--webpack`, or drop the helper and consume the pre-built package. Also warns when the merged alias map claims none of the packages, which reaches the same unstyled state by another route. (#6109)

#### Contributors

Thanks to everyone who contributed to this release:

- @joaodotwork

---

# 0.5.4

---

# 0.5.3

#### Fixes

- `withAstryx()` now resolves an app's own `@astryxdesign/*` imports to the packages' `source` entries. The scoped webpack rule only governs requests issued from inside `node_modules`, so app code resolved the library through `default` to `dist` while PostCSS compiled it from source — the two emit disjoint class names and the app rendered unstyled without erroring. (#5932)

#### Contributors

Thanks to everyone who contributed to this release:

- @PRIEYAN

---

# 0.5.2

---

# 0.5.1

#### Fixes

- Vite build: Astryx and product styles are split into their own cascade layers, so a theme's component overrides apply in a production build (#5410)
  StyleX emits every rule it collects into one top-level `@layer priority1…priorityN`. The dev server re-served those partitioned by source file — Astryx's own styles into `astryx-base`, the app's into `product` — but a build did neither, so the priority layers landed outside the `@layer reset, astryx-base, astryx-theme, product` order and outranked all of it. Every `components: {…}` override a theme set — a colour, a radius, a public custom property — was silently dropped in the built app while working in dev.

  The build now runs the same partition the dev server does, from the same helper, so the promised order holds in both: Astryx's styles are overridable by a theme, and an app's own styles still outrank everything.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.5.0

---

# 0.4.7

---

# 0.4.6

---

# 0.4.5

---

# 0.4.4

---

# 0.4.3

---

# 0.4.2

---

# 0.4.1

---

# 0.4.0

#### Fixes

- build: import `node:fs` statically so the Vite plugin's package discovery survives the ESM build (#4972)
  `astryxStylex()`'s config plugin discovered installed `@astryxdesign/*` packages with `require('node:fs')`. The `./vite` export ships only an ESM bundle (`dist/vite.mjs`, esbuild `format: 'esm'`), where esbuild lowers `require` to a shim that throws `Dynamic require of "node:fs" is not supported` — always, since native `require` never exists under ESM. The surrounding `try/catch` swallowed the throw, so `optimizeDeps.exclude` silently fell back to `['@astryxdesign/core']` and every other installed Astryx package stayed eligible for Vite pre-bundling, which strips `stylex.create`/`defineVars` calls and causes runtime errors.

  The discovery now uses a static `import fs from 'node:fs'`, which esbuild preserves as a real ESM import. A regression test compiles `vite.ts` with the same esbuild options as `build.mjs` and runs the discovery in a child `node` process, since in-process test runners provide a `require` shim that masks the bug.

#### Contributors

Thanks to everyone who contributed to this release:

- @is-jain

---

# 0.3.0

---

# 0.2.0

---

# 0.1.9

#### Fixes

- Scope the `source` resolve condition to @astryxdesign packages in withAstryx
  `withAstryx` set webpack's `conditionNames` to `['source', …]` globally, which resolved _any_ dependency shipping a `source` export to its raw TypeScript — not just Astryx packages. Third-party deps that ship a `source` export (e.g. `lexical`, pulled in by the new RichTextEditor lab component) were then fed untranspiled `.ts` through Next's babel and failed on syntax like `declare` class fields.

#### Contributors

Thanks to everyone who contributed to this release:

- @potatowagon

---

# 0.1.8

---

# 0.1.7

---

# 0.1.6

---

# 0.1.5

#### Other Changes

- Use node: protocol prefix for Node.js builtin imports (#3737)

#### Contributors

Thanks to everyone who contributed to this release:

- @Han5991

---

# 0.1.4

---

# 0.1.3

#### Fixes

- Use `pnpm build` in the `prepack` script so publishing no longer fails the `devEngines` package-manager check (#3564).

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang

---

# 0.1.2

#### Fixes

- ship TypeScript declarations for the `@astryxdesign/build/vite` export

#### Contributors

Thanks to everyone who contributed to this release:

- @benjipeng

---

# 0.1.1

#### Breaking Changes

- Rename `@xds/build` exports off the xds name
  The Vite integration's public exports are renamed: `xdsStylex` -> `astryxStylex`,
  and the option types `XDSVitePluginOptions` / `XDSVitePluginLegacyOptions` ->
  `AstryxVitePluginOptions` / `AstryxVitePluginLegacyOptions`. Update imports from
  `@xds/build/vite` accordingly. Internal plugin names and the babel wrapper are
  also rebranded. Part of removing `xds` naming from the public API.
- Rename Next.js helper `withXDS` to `withAstryx`
  The Next.js configuration wrapper is renamed `withXDS` -> `withAstryx`
  (exported from `@astryxdesign/build/next`). Update your `next.config.mjs`:
  `import {withAstryx} from '@astryxdesign/build/next'`. Part of removing xds
  naming from the public API.

#### Contributors

Thanks to everyone who contributed to this release:

- @ejhammond

---

# 0.1.0

#### Breaking Changes

- Default the StyleX library atomic-class prefix to `astryx` (was `xds`)
  `@astryxdesign/build`'s babel/Vite integrations now emit library atomic classes as
  `.astryx78zum5` by default instead of `.xds78zum5` (the `libraryPrefix` /
  `stylexPrefix` option default flips `xds` -> `astryx`). This is an opaque,
  StyleX-generated namespace — consumers don't target these classes directly —
  but it completes the removal of `xds` naming from build output. Consumers that
  explicitly configured `libraryPrefix`/`stylexPrefix` are unaffected.
- Remove the XDS-prefix compatibility layer — astryx is now the only public surface
  This release erases all `xds` naming from the public API; there is no compatibility
  window. Consumers must migrate (we own all consumers pre-OSS):
- Remove the daily, brutalist, and default themes; neutral is the new baseline
  Three theme packages are removed from the repo and will no longer be published:

#### Other Changes

- **Component names:** the `XDS*` aliases are gone — use bare names (`Button` not
  `XDSButton`, `useTheme` not `useXDSTheme`, `ButtonProps` not `XDSButtonProps`). The
  `drop-xds-prefix-imports` codemod automates this.
- **CSS classes:** components emit only `.astryx-*` (the dual `.xds-*` class is gone).
  Update custom CSS selectors `.xds-button` -> `.astryx-button` (prop/state value classes
  like `.primary`/`.sm` are unchanged).
- **data attributes:** only `data-astryx-theme` / `data-astryx-media` are written; update
  custom selectors and SSR root attributes off `data-xds-*`.
- **CSS layers:** `@layer xds-base` / `xds-theme` are renamed to `astryx-base` /
  `astryx-theme`; update your `@layer` order line and any PostCSS `layersBefore` config.
  `@astryxdesign/build`'s default library layer is now `astryx-base`.
- **Pre-compiled stylesheet:** the `@astryxdesign/core/xds.css` export is removed — import
  `@astryxdesign/core/astryx.css`.
- **CSS custom properties:** the `--xds-*` padding fallback is gone; set `--astryx-*`.
- **CLI config key:** `@astryxdesign/cli` reads the package.json `"astryx"` field (was `"xds"`).
  Rename the block; a stale `"xds"` key silently drops the package from discovery.
- `@astryxdesign/theme-daily`
- `@astryxdesign/theme-brutalist`
- `@astryxdesign/theme-default`
- import {defaultTheme} from '@astryxdesign/theme-default/built';
  - import {neutralTheme} from '@astryxdesign/theme-neutral/built';
- <Theme theme={defaultTheme}>...</Theme>
  - <Theme theme={neutralTheme}>...</Theme>

  ```

  ```

- Rename the npm package scope from `@xds/*` to `@astryxdesign/*`
  All published packages move to the new `@astryxdesign` scope (e.g. `@xds/core` → `@astryxdesign/core`), along with the workspace lockfile, build/runtime scope-directory scans, and docsite slug derivation. Consumers must update their imports and dependency names. The internal ESLint plugin namespace (`@xds/*` rules) is intentionally untouched and tracked separately. Existing `@xds/*` codemods continue to target the old scope so projects still on `@xds/*` can migrate.

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @ejhammond

---

# 0.0.15

#### Fixes

- **Unprefix migration alignment** — Build output and Vite plugin updated for the XDS-prefix migration (bare names canonical, `XDS*` compat aliases) so generated CSS stays in sync with `@xds/core` (#2941).

#### Contributors

Thanks to everyone who contributed to this release:

- @cixzhang
- @czarandy
- @ejhammond
- @josephfarina

---

# 0.0.14

_First public release_ — `@xds/build` is now published to the npm registry.

#### New Features

- **Streamlined `xdsStylex()` Vite API** — Simplified configuration for Vite projects (#2227)
- **Build step for Vite plugin** — Proper dist output for the Vite integration (#2205)

#### Internal

- **Migrated to pnpm** (#2197)
- **Bumped esbuild** from 0.24.2 to 0.28.0 (#2246)
