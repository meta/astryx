---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` warns when the page asks a media query in JavaScript, with Core's `useMediaQuery` (from `@astryxdesign/core` or `@astryxdesign/core/hooks`) or with `matchMedia`. The rendered file runs no script, so readers on every screen got the layout of the answer the page had on the server, with no word why. The new `screen-query` warning names each query and says to fold the layout with CSS: `Grid` with `columns={{minWidth}}`, or a StyleX `@media` or `@container` style.

@josephfarina
