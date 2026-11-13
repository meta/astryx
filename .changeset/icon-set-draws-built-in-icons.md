---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental icon use` now switches the built-in component icons too. In an app with a generated theme module, it rewrites the module so every added theme draws its built-in icons, such as the dialog close button, the select arrow, and the search icon, from the main set's theme map, with no theme edit. `theme add`, `theme use`, and `theme remove` keep the set when they rewrite the module, and Doctor's generated-module check expects it.

@josephfarina
