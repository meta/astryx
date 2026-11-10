---
'@astryxdesign/core': patch
---

[perf] Text and Heading: importing either no longer loads the Layer touch trigger or any tooltip code (Text drops from 11.6 to 6.8 KB gzip). Until truncated text is used, it holds a hover, tap or focus with native events only; the Tooltip loads once the text is truncated and answers that interaction as before. A touch press shows nothing until its tap, so a scroll leaves no tooltip behind. If the Tooltip module fails to load, the text stays as it is, and the next hover, tap or focus asks the module loader again.

@cixzhang
