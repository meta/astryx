---
'@astryxdesign/core': patch
---

[fix] FileInput: clearing the selection returns focus to the file-selection trigger. Before, both keyboard and pointer activation of the clear button focused the visually hidden native `<input type="file">`, which is `aria-hidden` and out of the tab order, so a screen reader announced nothing after the clear. Now focus lands on the trigger, which announces the field label. No API changes.

@kyu-rong
