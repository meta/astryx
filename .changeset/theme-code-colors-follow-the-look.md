---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a look now themes its code and its overlay scrim too.

- Each syntax role grows from its hue's color: keyword and type purple, string green, number and constant orange, function blue, tag red, attribute yellow, property teal. Comments, operators, punctuation and variables grow from the neutral. Each takes the nearest shade that reads at 4.5:1 on the code background and on the page. The code-block title follows the comment color.
- With a neutral color set, the code background and the overlay scrim come from the neutral.

A role no shade can draw readable keeps the base theme's, with a note. Results count these in one line, "code colors and the overlay: N values moved with the look". A `--color-syntax-*` or `--color-overlay` set by hand wins.

@josephfarina
