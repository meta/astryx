---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns, at its line, a typography value Core builds into something no browser uses, as `astryx experimental theme` refuses it: a font stack with a space in one `family` (Core quotes it whole), a quoted family name with a space, a role weight with no type scale, and a `weights` entry that is no heading level. Both judge a family by what Core writes, so a quoted name without a space (`'"Lato"'`) and a list without one (`'Lato,serif'`), which build as written, are taken. On the font dial, a weight number in any form CSS reads (`Inter +500`, `Inter 1e3`) after a known family, or a weight or style word before it (`700 Inter`, `bold Inter`), is that weight or style, never saved as a family of that name.

@josephfarina
