---
'@astryxdesign/cli': patch
---

[fix] `astryx swizzle --list` lists only component directories. It offered `__tests__`, `gestures`, `i18n` and `motion` as components, and `astryx swizzle` accepted them: copying `__tests__` produced an empty directory and copying `motion` or `gestures` produced files whose rewritten imports point at subpaths the core package does not export.

@thecodebasedot
