---
'@astryxdesign/cli': patch
---

[fix] `astryx integration check` and `astryx doctor` name a theme module that `theme build` wrote (`.js`, `.mjs` or `.cjs`) and that imports TypeScript source, as built themes from a CLI before this one do (`built_module_imports_typescript`, a `next` note with the weight of `relative_import_not_shipped`), with the file, the line, and the fix.

@josephfarina
