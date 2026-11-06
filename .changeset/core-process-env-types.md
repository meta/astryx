---
'@astryxdesign/core': patch
---

[fix] Core's source no longer needs Node's types to type-check. The modules that read `process.env.NODE_ENV` for development warnings now declare it themselves, so a component you swizzle type-checks in a project that does not install `@types/node`. Bundlers still replace the value at build time, so production builds drop the warnings as before. No API changes.

@cixzhang
