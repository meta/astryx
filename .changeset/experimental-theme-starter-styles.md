---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview app --theme` refuses a theme that imports a stylesheet in a language other than CSS by the same list the theme build loads (Stylus, PostCSS and SugarSS beside Sass and Less), and with a query after it (`./brand.scss?inline`), before anything is written. Before, those starters were made and the new app's type check stopped at the import. A refusal that comes after the theme's stale build was made again puts that build back, so the refused command changes nothing, as it says.

@josephfarina
