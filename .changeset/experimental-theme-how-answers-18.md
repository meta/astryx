---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a confidence gate, and dislikes, take-backs and dark-mode selectors read.

- When a question is a question ("is the card too round?"), says "tell me" or "but not too", or asks to "stop" something, how gives the lookup and asks for the change in words instead of guessing a write; "explain X" is the lookup of X.
- "I hate the shadows", "skip …" and "not a fan of …" ask for none of it when that is the whole ask.
- A change on one member of a group ("the text area") carries `--only`, so it does not reach the whole group.
- "3 pixels sharper", "take 2px off" and "remove 4px from" move the value down from where it is.
- "darkmode", `html.dark .card {…}` and `@media (prefers-color-scheme: dark) {…}` scope the change to dark mode.
- "Take back the shadow change" and "shadows like before" undo only what the theme sets, else say there is nothing to take back.
- "Pointer cursor on hover" sets the cursor; "opened accordion title" is the open state; "squre" and "eckiger" are square; "cards look flat" adds depth; "darker while being clicked" is the pressed state.

@josephfarina
