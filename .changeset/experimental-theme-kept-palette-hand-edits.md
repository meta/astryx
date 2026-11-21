---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a theme whose palette a newer CLI made stays as saved through hand edits and undo, and its refusal says what is true.

- A setting changed by hand in the settings file that leaves the whole-theme color settings alone (corners, or a part's color) keeps every color the settings module writes out. A hand edit that changes a whole-theme color setting still maps every color the module writes out this CLI's way.
- A whole-theme color token the palette maps comes back to its palette shade once undo takes its setting away; one set with this CLI and removed by hand takes this CLI's shade of the saved palette. A token the saved module never mapped gains no value from a set and its undo.
- After a color is changed by hand away from the saved palette, setting it back to its saved seed (or taking out one the palette has no shades for) is the way back, and the refusal names it, or each setting to put back when more than one is off; its result compares nothing, as the settings before it do not build. Beside the accent dial, a whole-theme `--color-accent` isn't something the kept palette is made from, so it saves as an exact value (`show`, `set` and `undo` agree); without the dial it's still refused.
- The refusal reads: "…does not make; its palette is kept as saved. Changes to what the palette is made from (the accent, neutral and status colors, the vibrancy) need a CLI that makes that recipe; other changes, including exact color tokens, a part's colors, the mode and the base, save as usual."

@josephfarina
