---
'@astryxdesign/cli': patch
---

[fix] A swizzled component whose source imports another Astryx package's internal module, such as a Lab component that uses Core's gesture primitives, no longer imports that private path, except a StyleX module that package exports, which the copy keeps importing by that path because its identity is its path. Swizzle carries every other such module, and what it reaches, into the copy under a folder named after its package (for example `components/astryx/core/internal/touch.ts`); that package's public names are still imported from the package.

@cixzhang
