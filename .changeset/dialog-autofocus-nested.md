---
'@astryxdesign/core': patch
---

[fix] Dialog: opening a dialog no longer moves focus to a `data-autofocus` field (such as a `TextInput` with `hasAutoFocus`) inside a closed dialog nested in it. A nested dialog's focus request belongs to that dialog alone. Before, a closed nested dialog whose box was still laid out (for example through a display utility class) could take the caret into a field nobody could see.

@nynexman4464
