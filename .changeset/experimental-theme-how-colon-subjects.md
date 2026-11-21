---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a part named before a list's colon, after the first, as a subject of the list, never as a piece held inside the first part: "popover, tooltip and hover card: dark" darkens the hover card too, instead of dropping it. A list whose first item has a colon of its own ("cards: white background, header: navy") keeps reading its later items as before.

@josephfarina
