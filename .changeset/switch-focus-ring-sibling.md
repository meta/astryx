---
'@astryxdesign/core': patch
---

[fix] `Switch`'s focus ring now follows the switch's own input through a sibling selector instead of a `:has()` check on the whole row, so a switch whose row holds large content (a long description, for example) no longer restyles everything in that row whenever something inside it changes. The ring looks and behaves the same. One edge changes: a focusable link inside the switch's label or description keeps its own focus ring and no longer also rings the switch.

@cixzhang
