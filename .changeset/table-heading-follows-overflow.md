---
'@astryxdesign/core': patch
---

[feat] A data-driven Table's column headings now follow its `textOverflow`, like the body cells. Under the default `wrap`, a heading longer than its column wraps onto more lines instead of ending in an ellipsis, so on a phone each column still says what it holds. Children-mode tables keep each heading on one line and grow its column to fit it, as before. Under `textOverflow="truncate"`, headings stay on one line and end in an ellipsis, as before.

@josephfarina
