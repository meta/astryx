---
'@astryxdesign/core': patch
---

[fix] With a finger, a press that starts on a control inside a list row with `onClick` or `href`, a TreeList row with an action or children, or a Token with `onRemove` no longer makes the row or token look pressed, since it does not run the row's or token's action. A press on the row or token itself still looks pressed. Mouse presses are unchanged.

@cixzhang
