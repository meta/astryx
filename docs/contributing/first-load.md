# Measure first-load JavaScript

Two commands measure what a page loads before first paint. Both build Core from
source at two git refs and compare a base with a head. Neither is a CI job.

- `pnpm size:pages --base <ref> [--head <ref>]` builds INV10's reference pages
  with esbuild, as the size report does, and prints each page's first-load gzip,
  base against head. A pull request that grows a shared module reports this
  delta
  ([`architecture:component-import-boundaries`](../architecture/component-import-boundaries.md)
  INV10).
- `pnpm size:matrix --ref <head> [--base <ref>] --pages <page,…>` (or
  `--pr <number>`) builds the same pages with Vite 8 (Rolldown), Rolldown on its
  own with inline common chunks off and at 64 KiB, and webpack 5, in production
  mode. For each page and bundler it prints the first-load gzip, the number of
  first-load chunks, and whether each deferred module stays out of first load.
  Use it when a change moves code behind `import()`: bundlers split shared code
  differently, so one bundler's number can hide extra requests or a module that
  stays in first load.

`size:matrix` pages are INV10's `docs`, `form`, `menu` and `table`, `button`,
`resize`, or a custom page such as `--pages popover=Popover` or
`resize=ResizeHandle@Resizable`. `--defer <module,…>` names the modules to check
(dist paths such as `Tooltip/tooltipSurface.js`). `--chunks` lists each
first-load chunk with its modules. `--json` prints JSON. Run `pnpm size:matrix`
without arguments for the full list.

Both commands build Core with the same helper. They copy Core's generated i18n
modules from your working tree into each ref they build, so run
`pnpm -F @astryxdesign/core build:i18n` first. `size:matrix --ref .` measures
the working tree, so you can measure a local change before you commit it.

`--pr` fetches that pull request and builds it with its own Babel configuration,
which runs its code on your machine. Use it only for a pull request you would
check out.

The app provides React, React DOM and StyleX, so no measurement counts them.
