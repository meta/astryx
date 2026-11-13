---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the font, text-size and type dials no longer say your theme file sets the tokens they write; a palette token your theme file sets gets no shade note, and your theme file comes first in every note (before an exact setting, before a dial) and after an undo. A token loop inside one part is refused when it closes through the base theme's or your theme file's rule for that part, a setting on a part that your theme file also sets on it says the file's value shows, and undo counts only the steps it can still go back to.

@josephfarina
