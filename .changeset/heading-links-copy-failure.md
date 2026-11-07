---
'@astryxdesign/core': patch
---

[fix] A Markdown heading's copy-link button now shows when the clipboard write fails, as CodeBlock's copy button does: the `#` becomes a cross for 1.5 seconds, and the button is named and announces "Failed to copy value to clipboard." It used to fail silently and leave `#` unchanged. The error itself is not shown.

@cixzhang
