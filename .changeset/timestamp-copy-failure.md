---
'@astryxdesign/core': patch
---

[fix] A Timestamp hover card's copy button now shows when the clipboard write fails, as CodeBlock's copy button does: the icon becomes a cross for 1.5 seconds, and the button is named, tooltipped and announces "Failed to copy value to clipboard." It used to do nothing. A theme that maps the `timestamp-copy` slot keeps its rest glyph during a failure (`copied` is false). The error itself is not shown.

@cixzhang
