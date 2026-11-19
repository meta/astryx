---
'@astryxdesign/cli': patch
---

[experimental] Receipts say what happened: `astryx experimental theme editor set` of a value the theme already has reads "font = system (whole theme) was already set; nothing changed" in place of "system -> system"; an `undo` names a setting that still applies where the removed one did ("#fef3c7 in light mode and the base theme's value in dark mode"), never the base value alone; and a theme set to one color mode says `astryx theme add <theme>` records the mode and its wiring passes it, in place of reading as a manual step. A dial already at its last rung names an exact size that goes past the rungs (`set t text-size 18`), beside the step the other way.

@josephfarina
