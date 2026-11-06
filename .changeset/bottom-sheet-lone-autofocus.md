---
'@astryxdesign/core': patch
---

[fix] A `BottomSheet` that opens, on its own or pushed over another sheet, modal or not, now focuses its `data-autofocus` field (a `TextInput` with `hasAutoFocus`) in every browser; for example, a pushed "Edit delivery note" sheet opens on its note field. A `BottomSheetSwitcher` step with such a field opens on it too. Before, Chromium left focus on the sheet's panel, so on Android a person had to tap the field before typing. A sheet with no such field still focuses where the browser's own dialog focusing puts it. (#10156)

@cixzhang
