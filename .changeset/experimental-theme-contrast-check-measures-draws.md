---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the contrast check measures what draws the text. A toast's text on Core's media surface reads the on-dark or on-light color, so a low one is a problem with a fix that sets it; a color given as a theme token (`var(--token)`) is measured as that token's value in each mode; and text on different parts is a problem for each part, so following one fix line no longer turns up the others as new.

@josephfarina
