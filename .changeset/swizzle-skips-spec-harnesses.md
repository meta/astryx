---
'@astryxdesign/cli': patch
---

[fix] `swizzle` no longer copies a component's browser test harnesses (`*.spec.ts`, `*.spec.tsx`, such as Item's `ItemMarkerColumns.a11y.chromium.spec.ts`). They import Playwright and an unpublished test package, so a project that swizzled such a component failed to type-check or build.

@cixzhang
