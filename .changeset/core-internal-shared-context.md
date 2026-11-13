---
'@astryxdesign/core': patch
---

[chore] Internal: Core's internal entries add `@astryxdesign/core/internal/shared-context`, which re-exports the shared React context helper for Lab components, so a swizzled copy's provider reaches the package's parts. Apps import nothing new.

@cixzhang
