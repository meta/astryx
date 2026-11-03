---
'@astryxdesign/core': patch
---

[fix] When a `HoverCard`'s trigger element is replaced after mount, by new children or by a child component that swaps its own root element, the new element now gets the card's popup attributes or description and opens the card on hover and focus. Before, it stayed unwired until the card next opened or closed or its `label` changed.

@cixzhang @duytbp
