---
'@astryxdesign/cli': patch
---

[docs] "Author a theme" lists the `<name>.modules/` folder among `theme build`'s outputs (the compiled local modules the built module imports, which ship with it), and its icon registry and slot sections now say that a TypeScript or JSX registry or slot module is compiled into that folder, when `--icons-specifier` fits (a registry you build yourself, or a plain JavaScript registry with `--out` elsewhere), and that a plain JavaScript file is not copied into the folder. Family builds name their `<family-key>.modules/` folder too.

@josephfarina
