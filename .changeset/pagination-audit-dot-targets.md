---
'@astryxdesign/core': patch
---

[fix] Pagination: on a touch screen each dot in the `dots` variant now takes taps in a larger invisible area around it, up to halfway to the next dot, so a finger can hit an 8 px dot. Under reduced motion a dot's colour changes at once instead of fading. The `totalItems` and `totalPages` docs now say that `totalPages` wins when both are given, as the code does.

@cixzhang
