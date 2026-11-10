---
'@astryxdesign/core': patch
---

[feat] Typeahead: Backspace or Delete on the selected Token clears the value, as the clear button does, when the clear button shows: it calls `onChange(null)`, announces the cleared value, and moves focus to the empty input. Without `hasClear`, the keys start editing, as a click does.

@cixzhang
