---
'@astryxdesign/cli': patch
---

[docs] "Author a theme" lists the `<name>.modules/` folder among `theme build`'s outputs (the compiled local modules the built module imports, which ship with it), and its icon registry and slot sections now say that a TypeScript or JSX registry or slot module is compiled into that folder, that `--icons-specifier` is only for a registry you build yourself, and that a plain JavaScript module keeps its source path.

@josephfarina
