---
'@astryxdesign/core': patch
---

[fix] A theme value left `undefined` in a part's style block, a pseudo-class block or an `onDark`/`onLight` surface is now not set, as a page token left `undefined` already was: the stylesheet writes nothing for it, and a value the theme inherits for that property stays. Before, the stylesheet held the text `undefined` (`padding: undefined;`), which the browser drops, and the inherited value was lost too.

@josephfarina
