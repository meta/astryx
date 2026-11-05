---
'@astryxdesign/core': patch
---

[fix] Item: the `item` theme target now reflects the row's state as `data-highlighted`, `data-selected`, and `data-disabled`, so a theme can restyle a highlighted, selected, or disabled row. Rows that compose Item, such as list and menu rows, get the same states. The docs list `className` and `style`, give `ref` the root element type, and give `xstyle` its standard description.

@cixzhang
