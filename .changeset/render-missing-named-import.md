---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` refuses a page that imports a name its module does not export, as a build refuses it, with `ERR_RENDER_COMPILE`: "The page does not compile (page.tsx, line 3): @astryxdesign/core has no export Chart". It checks named imports from the page's own modules, from Astryx packages and from StyleX variables modules (`.stylex`), and only names the page uses as values, so a type imported without `type` is fine. Before, such a page rendered with exit 0 and broke in the browser ("Element type is invalid"), or showed without a style when StyleX compiled a missing value to a variable nothing defines.

@josephfarina
