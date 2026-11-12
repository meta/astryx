---
'@astryxdesign/cli': patch
---

[docs] `astryx docs styling/tokens-and-setup` has a Next.js with webpack section. It shows `experimental.optimizePackageImports: ['@astryxdesign/core']` in `next.config.mjs` and recommends a component entry, such as `@astryxdesign/core/Button`, in Server Components. Without either, a webpack build ships every Astryx client component to a page whose Server Component imports from the package root. The theme preview starter app that `astryx experimental theme preview app` copies has the same setting. No API changes.

@cixzhang
