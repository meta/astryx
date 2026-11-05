---
'@astryxdesign/cli': patch
---

[perf] A standalone `astryx theme build` against the current Core loads Core's root entry only when the theme imports it. A theme that imports only `@astryxdesign/core/theme` no longer loads all of Core and its components. Family builds and builds against an older Core still load the root. Some builds hand the theme its Core: family builds, builds against an older Core, and themes whose folder has no Core. There, a theme that imports a Core root `require()` cannot load, such as one that awaits at its top level, fails with `ERR_THEME_LOAD`. The error names that root.

@vjeux
