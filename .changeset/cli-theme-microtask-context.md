---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` reports a microtask exception from a loading theme as `ERR_THEME_LOAD` on Node 22.13, with the theme path and the original error. Late theme callbacks remain warnings, and unrelated exceptions keep their own error boundary.
@astracat-bot
