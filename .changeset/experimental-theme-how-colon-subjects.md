---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a part named before its sentence's first colon as a subject of the list, never as a piece held inside the first part: "popover, tooltip and hover card: dark" and "popover and hover card: dark" darken the hover card too, instead of dropping it. A part named after that colon ("cards: white background, header: navy") stays an item of the list, as before.

@josephfarina
