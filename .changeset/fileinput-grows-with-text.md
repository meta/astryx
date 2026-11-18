---
'@astryxdesign/core': patch
---

[fix] FileInput: in input mode the field grows with enlarged text, so its prompt, wrapped or not, stays inside its borders instead of running across them. At the default text size a one-line field keeps its height; a prompt that wraps in a narrow field grows it.

@cixzhang
