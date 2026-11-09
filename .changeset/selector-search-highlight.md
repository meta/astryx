---
'@astryxdesign/core': patch
---

[fix] In a searchable `Selector` or `MultiSelector`, typing now clears the highlight, so Enter never picks an option you did not highlight. Before, the highlight kept its old position, which could point at a different option of the filtered list or at nothing. ArrowDown then starts at the first row: the first enabled match in `Selector`, and Select all or the create row when shown in `MultiSelector`.

@cixzhang
