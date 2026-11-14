---
'@astryxdesign/core': patch
---

[fix] A theme value left `undefined` in a part's style block, a color-mode block (`@light`, `@dark`), a pseudo-class block, an `onDark`/`onLight` surface or an adaptation rule's parts is now not set, as a page token left `undefined` already was: the stylesheet writes nothing for it. In a style key or a color-mode block, the value the theme inherits for that property stays; a restated pseudo-class block still replaces the inherited one whole. Before, the stylesheet held the text `undefined` (`padding: undefined;`), which the browser drops, and the inherited value was lost too; in an adaptation rule, `defineTheme` refused the theme. A `null` value keeps its meaning: it replaces an inherited value and is written as it is, and an adaptation rule still refuses it.

@josephfarina
