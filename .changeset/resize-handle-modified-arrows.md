---
'@astryxdesign/core': patch
---

[fix] A focused `ResizeHandle` acts only on its own keys: plain arrows, Shift with an arrow, Home, End and Enter. Any other combination, such as Alt, Control or Command with an arrow, Home, End or Enter, or Shift with Home, End or Enter, now passes through to the page, so the browser's own shortcuts on those keys (history navigation, scrolling to the top or bottom) and the app's own shortcuts run.

@cixzhang
