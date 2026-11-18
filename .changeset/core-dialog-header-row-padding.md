---
'@astryxdesign/core': patch
---

[fix] A theme's padding on a Dialog's or Drawer's header row sets the row's height again. The header row no longer pulls itself up into the header's padding; the header's own block padding gives way instead. A theme that sets the header's padding to zero and pads the row draws the row flush with the top, with its title inside its padding. Official themes draw the same pixels.

@josephfarina
