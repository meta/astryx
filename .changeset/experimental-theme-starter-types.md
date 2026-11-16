---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview app --theme` refuses a theme that imports a file only a bundler loads by a name the new app's type check has no declaration for: a CSS file with a query or a hash (`./brand.css?inline`), an upper-case extension (`./brand.CSS`), or a font file (`./brand.woff2`). Before, the new app was made and its type check stopped at that import. The declarations it reads are the new app's own (`*.css`) and the pictures Next declares. A refused command that put back a build it made first now puts back each file's and folder's times too, so a dev server or watcher sees no change.

@josephfarina
