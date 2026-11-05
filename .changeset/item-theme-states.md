---
'@astryxdesign/core': patch
---

[fix] Item: the `item` theme target now reflects the row's state as `data-highlighted`, `data-selected`, and `data-disabled`, so a theme can restyle a highlighted, selected, or disabled row. A row that composes Item reflects the states it passes to Item: for example, ListItem reflects selected and disabled, and RadioListItem reflects disabled. The docs list `className` and `style`, give `ref` the root element type, and give `xstyle` its standard description.

@cixzhang
