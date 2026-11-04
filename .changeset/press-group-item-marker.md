---
'@astryxdesign/core': patch
---

[chore] Internal: the touch press controller leaves the press of an action that its group's own tracker paints (`data-astryx-press-group-item`) to that tracker, so one writer paints each press. A key's press on the action still paints as before.

@vjeux
