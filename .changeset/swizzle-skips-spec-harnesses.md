---
'@astryxdesign/cli': patch
---

[fix] `swizzle` no longer copies a component's browser test harnesses (`*.spec.ts`, `*.spec.tsx`, such as Item's `ItemMarkerColumns.a11y.chromium.spec.ts`) when the installed Core source holds them: `@astryxdesign/core` 0.7.5 and earlier, or Core's repository source. They import Playwright and an unpublished test package, so a project that swizzled such a component failed to type-check or build. Core 0.7.6 and later ship no harnesses, so swizzling from them is unchanged.

@cixzhang
