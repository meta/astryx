---
'@astryxdesign/core': patch
---

[feat] Themes can draw Pagination's controls as one joined strip. The control row carries `pagination-list`, each of its Button controls carries `pagination-item` (the current page's reflects `data-selected`), and the ellipsis carries `pagination-ellipsis`. A theme's `pagination-item` entries win over its `button` entries on the cells, whatever their keys. The default look does not change.

@josephfarina
