---
'@astryxdesign/core': patch
---

[fix] PowerSearch: in the popover presentation, a built-in filter token's button was named by its field and operator only ("Status: is") and gave no sign that it opens an editor. Two filters on one field sounded the same, and the visible value was missing from the name. Now the token is named by all its visible text ("Status: is Open"), has `aria-haspopup="dialog"` and `aria-expanded`, and opens an editor that is a dialog of the same name. Its remove button is "Remove Status: is Open". Token: `aria-haspopup` and `aria-expanded` now reach a clickable token's inner button, beside `aria-labelledby` and `aria-describedby`.

@cixzhang
