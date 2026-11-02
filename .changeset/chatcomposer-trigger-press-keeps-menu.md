---
'@astryxdesign/core': patch
---

[fix] A press in a ChatComposerInput's own editor no longer closes its open trigger menu (the `@` mention or `/` command list). Clicking inside the query keeps the menu showing; a click that moves the caret out of the query, a press anywhere else on the page and Escape still close it.

@cixzhang
