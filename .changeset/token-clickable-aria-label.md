---
'@astryxdesign/core': patch
---

[fix] A clickable `Token` passes a caller's `aria-label` to its inner button when no `aria-labelledby` is supplied, so repeated chip labels can have distinct accessible button names without leaving `aria-label` on the outer `span`.

@rheatkhs
