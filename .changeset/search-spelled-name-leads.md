---
'@astryxdesign/cli': patch
---

[fix] Search: an entry whose name has three or more words now comes first in its group of results when the query writes every word of that name, in order and apart, with at most one word misspelled (same first letter). `astryx search "pagination dots carousle"` lists the PaginationDotsCarousel block before the Pagination component, and `toggle button gropu` lists ToggleButtonGroup before ToggleButton. Matches, scores, reasons and counts are unchanged; `build` is unchanged.

@josephfarina
