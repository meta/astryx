---
'@astryxdesign/core': patch
---

[fix] A theme value left `undefined` in a part's style block, a pseudo-class block, an `onDark`/`onLight` surface or an adaptation rule's parts is now not set, as a page token left `undefined` already was: the stylesheet writes nothing for it, and a value the theme inherits for that property stays. Before, the stylesheet held the text `undefined` (`padding: undefined;`), which the browser drops, and the inherited value was lost too; in an adaptation rule, `defineTheme` refused the theme. A value left `null` is still refused there.

@josephfarina
