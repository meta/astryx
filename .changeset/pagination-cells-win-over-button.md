---
'@astryxdesign/core': patch
---

[fix] A theme's entries for Pagination's cells (`pagination-item`: a border between cells, the hover, the current page's fill) now win over its `button` entries on the same element, whatever their keys; before, a `button` entry keyed on variant, size or elevation took the cells' look. Themes that set no `pagination-item` entry are unchanged.

@josephfarina
