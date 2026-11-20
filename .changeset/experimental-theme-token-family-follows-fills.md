---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a token family follows the token it is made from. A surface the theme sets (`--color-background-surface`) now carries the fills made from it, cards, popovers and menus, the muted fill (table stripes), code blocks and skeletons, at the base theme's lightness step from it; an opaque `--color-border` carries `--color-border-emphasized`, so inputs and selectors frame like cards; and the neutral color now reaches the page (`--color-background-body`, the app shell's header and side nav) at the official theme's step, as it reaches the cards. A token the theme pins, by a setting or its own source, always keeps its value.

@josephfarina
