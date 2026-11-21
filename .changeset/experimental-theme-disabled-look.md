---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set … background <gradient> --on <part>`: a gradient or image set on a part (a button and its family) gives each part it reaches the theme's disabled treatment when disabled: the image comes off so the disabled fill shows, in every variant it reaches (the part's background rolls back to Core's disabled look). A disabled image of the theme's own wins; a disabled fill of its own shows, with only the image taken off, whatever the order they were set in.

@josephfarina
