---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` (one theme or a family) and `astryx doctor` load Core's root entry, which brings all of Core, only when a theme module or a `.cjs` dependency of one requires `@astryxdesign/core`, whether that is the CLI's Core or the app's installed one; a theme that imports only `@astryxdesign/core/theme`, or nothing from Core, no longer waits for it; a root entry that is there but fails to load now fails the build with its own error, where it used to be replaced silently by the theme subpath.

@vjeux
