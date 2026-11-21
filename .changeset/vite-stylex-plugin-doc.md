---
'@astryxdesign/cli': patch
---

[fix] The StyleX setup docs name `@stylexjs/unplugin` (`stylex.vite()`) for Vite. Under Vite, `@stylexjs/rollup-plugin` fails on `astryx.css`, so a page template that uses StyleX stayed blank. The note on such a template now points to the setup section.

@josephfarina
