---
'@astryxdesign/build': patch
---

[feat] `withAstryx()` builds Astryx from source under Turbopack instead of refusing to. It points each package's documented entry points at their source, compiles that source with the settings the prebuilt stylesheets use, and keeps the app's own Turbopack rules off it. The new PostCSS plugin `@astryxdesign/build/next/postcss` replaces an `@astryx;` rule with each source-built package's prebuilt stylesheet, compiled from that source: the same rules and selectors, in the same order, inside `@layer astryx-base`. Under Turbopack, the webpack setup's `@astryxdesign/build/postcss` refuses to run beside `withAstryx()`, since its rules never match the classes Turbopack renders. In this source build, an installed Astryx package with a malformed `package.json` fails the build instead of being left out. The webpack setup is unchanged.

@vjeux
