---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an undo that says a mode ("undo the light mode accent change", "in dark mode, reset the card background") takes back the setting the theme saves for that mode only, instead of both. A setting saved the same for both modes is named, with how to take it back in both; when the theme saves nothing for that mode, the answer says so. A change said earlier in the same ask is what an undo that names one change takes back, before any saved setting; after such a change, an undo that names several takes nothing back, saved settings included, and says so. When a mode has its own setting beside one for both modes, the answer says what the mode falls back to.

@josephfarina
