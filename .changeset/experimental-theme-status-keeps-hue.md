---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme set`: an accent no longer turns the hue of the status colors it grows (success, warning, error, info). A role keeps the base theme's hue (an error stays its red, info its blue) and only takes the accent's strength. A role that would then read as the accent keeps the base theme's colors, as before.

@josephfarina
