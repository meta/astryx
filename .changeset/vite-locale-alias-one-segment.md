---
'@astryxdesign/build': patch
---

[fix] `astryxStylex()`'s alias for `@astryxdesign/core/locales/<locale>.generated.js` takes one path segment, so the per-namespace English slices under `locales/en/` — which the package's exports map keeps out of reach — no longer resolve through the source tree in a Vite app either.

@vjeux
