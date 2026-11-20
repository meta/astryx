---
'@astryxdesign/build': patch
---

[fix] In a Vite source build with `astryxStylex()`, importing `@astryxdesign/core/astryx.css`, from a module or with a CSS `@import`, no longer fails the build or the dev server. `reset.css` resolves to its file, and `astryx.css`, the prebuilt stylesheet a source build replaces, loads an empty stylesheet, because StyleX already compiles those rules from source.

@josephfarina
