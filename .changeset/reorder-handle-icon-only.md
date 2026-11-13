---
'@astryxdesign/core': patch
---

[feat] A reorderable List row's handle is its 16px grip alone, with no box round it, so it takes the room a start icon takes. A mouse hits it anywhere in an invisible 24px square round the grip, the WCAG 2.5.8 minimum, where reorder mode's fill and the focus ring also sit; in reorder mode the square's corners round with the fill. A finger keeps its 44px target: under a coarse pointer the handle steps in from its row's edge so the list never cuts that target. A handle that shows on hover now needs 28px outside the row's text, down from 30px.

@ernestt
