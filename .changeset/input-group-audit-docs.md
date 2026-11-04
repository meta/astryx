---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[docs] InputGroup: the docs no longer say `status` paints the group border or that the group shares one focus ring. `status` shows its message below the group and reflects its type as `data-status`; a focused member stays above its neighbours. `isOptional` names the "Optional" indicator it shows. A new search-with-action example (`astryx component InputGroup --blocks`) shows a Button addon joining the row.

@cixzhang
