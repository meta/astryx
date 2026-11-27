---
'@astryxdesign/lab': patch
---

[fix] Schedule: the week and day time grid is a keyboard tab stop from the first frame it scrolls in, including when loaded events replace the loading view. Before, a newly shown grid could scroll for a moment before the keyboard could reach it.

@cixzhang
