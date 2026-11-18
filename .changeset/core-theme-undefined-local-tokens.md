---
'@astryxdesign/core': patch
---

[fix] `defineTheme` treats a local token left `undefined` (in the theme or in an adaptation rule's `localTokens`) as not set, as a token, or a value in a part, surface or adaptation rule, left `undefined` already is: the theme builds and the stylesheet writes nothing for it. Before, it was refused as no CSS string, so a conditional spread or an unset environment value failed the theme. An adaptation rule that writes a local token name no theme in the lineage declares still fails with its name. `localTokens: undefined` at the root is refused by name ("localTokens is undefined: omit the field or pass an object"), as `extends: undefined` is: a root `localTokens` or `extends` left undefined is almost always a failed import.

@josephfarina
