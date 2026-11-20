---
'@astryxdesign/core': patch
---

[feat] Themes can draw Pagination's controls as one joined strip. The control row carries `pagination-list`, each of its Button controls carries `pagination-item` (the current page's reflects `data-selected`), and the ellipsis carries `pagination-ellipsis`. On the cells, `pagination-item` competes with the theme's `button` entries: its base rule loses to a `button` entry keyed on variant, size or elevation, and its hover and selected rules weigh the same as a one-key `button` rule, so the later one in the theme wins. The default look does not change.

@josephfarina
