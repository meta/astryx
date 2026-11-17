---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` reports what a theme's own changes did not reach where it applies: `new` with a color or dial counts and names the parts it missed as `set` does (`missed`, `missedParts`, and the new `missedOn` in JSON), every change names the parts it missed rather than only counting them, and a base theme square by design is no longer told its soft shadows sit beside square corners it did not choose. `show --section <family>` pictures that family first, with its parts drawn open after it, not the overlays.

@josephfarina
