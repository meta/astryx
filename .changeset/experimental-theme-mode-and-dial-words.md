---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a page or text color typed as a CSS property with no part (`set t background '#0f172a'`) is offered for the mode it reads in first (`--color-background-body '#0f172a' --mode dark`), with the both-modes line after it, so the suggestion does not leave the other mode unreadable; a color that reads in both modes is offered once, as before. The words people write for a dial reach it: a name with `-color` or `-colour` after it (`primary-color`, `brand-color`), a plural (`shadows`), and `shadows none` / `dark-mode true` / `light-mode true`, which name the dial and the value that does it (`surfaces flat`, `mode dark-only`).

@josephfarina
