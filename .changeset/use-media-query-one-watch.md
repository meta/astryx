---
'@astryxdesign/core': patch
---

[fix] `useMediaQuery` now shares one listener per query among all its callers, so a long list of components that ask the same query adds one listener, not one per component. Every caller still reads the same answer. It also listens on Safari before 14, which has only the older listener pair, where it threw before.

@vjeux
