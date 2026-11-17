---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview app --theme` judges an import written as a template literal with nothing put in it (``await import(`../shared.ts`)``) as the string it holds, so a theme file outside the theme folder, a Sass file or a name the new app cannot type is refused there as it is when quoted. A query or a hash on any module the theme imports (`./x.ts?raw`, `./d.json?raw`) is refused too, since the new app's type check reads it as part of the module's name.

@josephfarina
