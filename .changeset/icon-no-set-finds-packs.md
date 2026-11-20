---
'@astryxdesign/cli': patch
---

[experimental] With no icon set installed, `astryx experimental icon` and `astryx experimental icon --list` now name the discover search that lists icon packs when discover lists one the project could add: Find an icon pack with `astryx discover "icon set"`, install it, then run `astryx experimental icon use <set>`. To make your own set, read `astryx docs cli/experimental/icon-sets`. The finder reads the catalog copies discover saved and calls no discover source, so before the first discover run, and where no catalog lists an icon pack, the step reads as before. The JSON `next` field carries the same sentence; its shape does not change.

@josephfarina
