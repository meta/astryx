---
'@astryxdesign/core': patch
---

[fix] `defineTheme` treats `localTokens: undefined`, and a local token left `undefined` (in the theme or in an adaptation rule's `localTokens`), as not set, as every other theme value left `undefined` already is: the theme builds and the stylesheet writes nothing for it. Before, `localTokens: undefined` was refused as "localTokens must be a token map", and a local token left `undefined` was refused as no CSS string, so a conditional spread or an unset environment value failed the theme.

@josephfarina
