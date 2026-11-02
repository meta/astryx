---
'@astryxdesign/core': patch
---

[chore] Internal: a mouse or pen drag that a gesture claims takes no new text selection and keeps the page's existing one, from the claim of whichever recognizer makes it (a swipe or a recognizer waiting on another's failure included), and a drag that starts on selectable text is left to the browser, which selects that text. Not exported from the package entry point.

@vjeux
