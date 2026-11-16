---
'@astryxdesign/cli': patch
---

[fix] On Node 22.13, `astryx theme build` reports a microtask exception from a loading theme whose folder has its own Core as `ERR_THEME_LOAD`, with the theme path and the original error. A theme microtask callback that throws after the load now produces a warning instead of failing the build. Unrelated exceptions keep their own error boundary.
@astracat-bot
