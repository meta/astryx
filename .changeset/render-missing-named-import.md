---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` refuses a page that imports a name its module does not export, as a build refuses it, with `ERR_RENDER_COMPILE`: "The page does not compile (page.tsx, line 3): ./lib has no export b". This covers a StyleX variables module (`.stylex`) too, where StyleX would otherwise compile the value to a variable that nothing defines, so the page showed without that style and no error. Before, such a page rendered with exit 0.

@josephfarina
