---
'@astryxdesign/core': patch
---

[docs] MultiSelector: the `ref` entry says the search input, not the trigger, is the combobox with `hasSearch` on a field that is not read-only. It used to say "editable field", which also seemed to cover a disabled searchable field, where the trigger has no combobox role.

@cixzhang
