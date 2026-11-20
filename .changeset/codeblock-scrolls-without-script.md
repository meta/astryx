---
'@astryxdesign/core': patch
---

[fix] `CodeBlock` scrolls a long line, or code past `maxHeight`, before script runs and in a page that runs none, such as a file made with `astryx experimental render`. Until now the code was cut off at the edge of the block until script measured it, and in a static page it stayed cut off. The code viewport still becomes a Tab stop only while its code overflows.

@josephfarina
