---
'@astryxdesign/core': patch
---

[fix] A press in a ChatComposerInput's own editor no longer closes its open trigger menu (the `@` mention or `/` command list). Clicking into the draft to move the caret keeps the menu showing; a press anywhere else on the page and Escape still close it.

@cixzhang
