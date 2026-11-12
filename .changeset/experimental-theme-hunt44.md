---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: your theme file comes first in more places. A token loop inside a part's state or variant rule is refused when it closes through the part's plain rule (the base theme's or your file's); a part dial, a group or a variant setting that your file sets on a part says so; undoing a part setting your file also sets names the file's value; `show` names every exact setting your file sets itself; and a note that says to take a token out of your file names the exact setting that then shows. On phones, the font families and weights your file sets win as they do on wide screens, and an exact one your file masks stays masked there. `compile` of an editor theme's edited source records it, so the next editor command does not build it again for that alone (the shared theme command gains an optional group hook for this; the stable `theme build` is unchanged).

@josephfarina
