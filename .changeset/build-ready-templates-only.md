---
'@astryxdesign/cli': patch
---

[fix] `astryx build` reads search as if every page template that is not ready yet were absent: search leaves such templates out of what it ranks for build, so the start, the page list, the block suggestions, the components and `matchCount` are exactly what they would be without them. A not-ready template's name typed as the idea no longer empties the kit. When the idea names a not-ready template that search matches directly, the reason still says it is not ready yet. `astryx search` still lists every template.

@josephfarina
