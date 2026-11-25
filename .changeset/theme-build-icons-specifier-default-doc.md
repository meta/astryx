---
'@astryxdesign/cli': patch
---

[docs] `theme build --icons-specifier` (and `experimental theme compile`) now gives the right default: a TypeScript or JSX registry's compiled copy in `<name>.modules/`, or a plain JavaScript registry's own path, and says a given specifier is not compiled. "Author a theme" adds that a theme family imports a member's plain JavaScript registry by its path from the family module.

@josephfarina
