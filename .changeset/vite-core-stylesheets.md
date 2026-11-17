---
'@astryxdesign/build': patch
---

[fix] In a Vite source build with `astryxStylex()`, importing `@astryxdesign/core/astryx.css` no longer fails the build. Core's stylesheet imports now resolve the way Core's package exports name them: `reset.css` is its file, and `astryx.css`, the prebuilt stylesheet a source build replaces, loads nothing, because StyleX already compiles those rules from source.

@josephfarina
