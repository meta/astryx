---
'@astryxdesign/cli': patch
---

[fix] `astryx swizzle --list` no longer lists Core's shared folders (`animator`, `gestures`, `i18n`, `internal`, `keyboard`, `motion`, `privateAttributes`, `__tests__`) as components. A copy of `gestures` imports `@astryxdesign/core/motion`, which the core package does not export.

@thecodebasedot
