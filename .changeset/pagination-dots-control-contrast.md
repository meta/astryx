---
'@astryxdesign/core': patch
---

[fix] Pagination: in the `dots` variant, a dot that is not the current page is filled with the form-control edge colour, so it stands out at 3:1 from the page in every bundled theme, light and dark (WCAG 1.4.11). It was about 1.2:1.

@cixzhang
