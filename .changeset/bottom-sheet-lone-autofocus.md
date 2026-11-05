---
'@astryxdesign/core': patch
---

[fix] A `BottomSheet` opened on its own, modal or not, now focuses its `data-autofocus` field (a `TextInput` with `hasAutoFocus`) in every browser. Before, Chromium left focus on the sheet's panel, so on Android a person had to tap the field before typing. A sheet with no such field still focuses where the browser's own dialog focusing puts it.

@cixzhang
