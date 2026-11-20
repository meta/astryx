---
'@astryxdesign/cli': patch
---

[fix] Search: an entry whose name of three or more words the query spells out as words apart now comes first in its group of results, also with a typo in the name (`astryx search "pagination dots carousle"` lists the PaginationDotsCarousel block before the Pagination component). Matches, scores, reasons and counts are unchanged; `build` is unchanged.

@josephfarina
