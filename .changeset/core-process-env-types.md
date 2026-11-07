---
'@astryxdesign/core': patch
---

[fix] The Core modules that read `process.env.NODE_ENV` for development warnings now declare it themselves, so those files type-check in a project that does not install `@types/node`, such as a swizzled `Breadcrumbs`, `Stepper` or `TabList`. Bundlers still replace the value at build time, so production builds drop the warnings as before. No API changes.

@cixzhang
