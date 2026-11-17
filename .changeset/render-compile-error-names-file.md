---
'@astryxdesign/cli': patch
---

[experimental] When a page does not compile, `astryx experimental render` names the file and the line the error points at, also for a module the page imports. When StyleX cannot read a value a style imports, the message names the value and the import, and says what StyleX needs: the value written in the style, or a `.stylex.ts` or `.stylex.js` file that defines it; for a `.stylex` file it cannot find, it says to check that the file or its package is there.

@josephfarina
