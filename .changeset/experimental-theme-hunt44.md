---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: your theme file comes first in more places. A token loop inside a part's state or variant rule is refused when it closes through the part's plain rule (the base theme's or your file's); a part dial, a group or a variant setting that your file sets on a part says so; undoing a part setting your file also sets names the file's value; `show` names every exact setting your file sets itself; and a note that says to take a token out of your file names the exact setting that then shows. After `compile` of an edited theme file, `show` reads the build as current when `compile --check` would, instead of building it again.

@josephfarina
