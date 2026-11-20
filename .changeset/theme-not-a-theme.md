---
'@astryxdesign/core': patch
---

[fix] `Theme` no longer stops the page when `theme` gets a value that is not a defined theme, such as the mode string `"light"`, a plain object or `undefined`. That Theme applies no theme of its own: its subtree keeps the theme around it, or Core's default tokens at the root, and still takes its `mode`. The server and the browser render the same markup. In development a warning names the value, and for a mode string it points to the `mode` prop.

@josephfarina
