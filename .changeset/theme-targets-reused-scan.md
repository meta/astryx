---
'@astryxdesign/cli': patch
---

[perf] A process that calls `themeTargets()` more than once scans Core's component docs once. It reuses that scan while every folder and doc it read is unchanged, as the docs and search catalogs do. A Core reached through a symlink, as a project's node_modules reaches it, shares the scan of its real path. A one-shot `astryx theme targets` and the theme build's target check still scan once. Every command reports the same targets.

@vjeux
