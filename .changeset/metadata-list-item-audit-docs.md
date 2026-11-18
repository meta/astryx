---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] MetadataListItem's prop docs now list `xstyle`, `className`, `style`, `ref`, and `data-testid`, and say which element each one reaches: the label `dt` when the item is side by side, or the wrapper when it is stacked. The `data-testid` docs say that a side-by-side item puts `-label` and `-value` on its two cells.

@cixzhang
