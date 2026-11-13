---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: `font math` is accepted as the CSS generic family it is; the generic families are read from the CSS grammar. With an exact `--font-size-base` set, `how 'bigger text'` steps that token (14px to 17.5px) instead of offering a `text-size` the token would mask. A color dial edited by hand to a see-through, system or variable color (`#2563ebcc`, `transparent`, `Canvas`, `var(--x)`) is refused by name with the undo that removes it, instead of building a gray accent. A value typed with full-width characters, a trailing dot or a CSS comment (`１８`, `18.`, `＃2563eb`, `#2563eb /* brand */`) is suggested as the value meant. `set` refuses a `var()` loop that closes through a token in the theme's own `<theme>.theme.ts`. `show` notes each token the theme's own source sets that a whole-theme dial also writes.

@josephfarina
