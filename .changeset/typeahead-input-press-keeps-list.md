---
'@astryxdesign/core': patch
---

[fix] A press in a Typeahead's or Tokenizer's own text input, or on its buttons, no longer closes its open list. Clicking between two letters to fix a typo moves the caret and keeps the matches showing; a press anywhere else on the page still closes the list, and Escape still does.

@duytbp
