---
'@astryxdesign/core': patch
---

[fix] A focused `ResizeHandle` no longer resizes on an arrow with Alt, Control or Meta (Command) held. Those keys pass through to the page, so platform word and line movement and an app's own shortcuts keep working. Plain and Shift arrows, Home, End and Enter resize as before.

@cixzhang
