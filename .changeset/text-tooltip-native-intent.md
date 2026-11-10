---
'@astryxdesign/core': patch
---

[perf] Text and Heading: importing either no longer loads the Tooltip component, the layer runtime or the touch trigger (Text drops from 11.6 to 6.9 KB gzip, Heading from 12.0 to 7.3 KB). Until truncated text is used, it holds a hover, tap or focus with native events only; the Tooltip loads once the text is truncated and answers that interaction as before. Touch behavior is unchanged. If the Tooltip module fails to load, the text stays as it is, and the next hover, tap or focus asks the module loader again.

@cixzhang
