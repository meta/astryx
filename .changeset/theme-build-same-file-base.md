---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` reads a base theme that the same file defines as a const, and that the theme's `extends` names (directly, or through `defineTheme(...)` or a wrapper), as the theme it extends, not as the theme itself: a setting the base's variant beats is named, and the theme's own lookup never reads that base. A base that a call returns (`extends: makeBase()`) or that a helper's object names is still read as the theme's own.

@josephfarina
