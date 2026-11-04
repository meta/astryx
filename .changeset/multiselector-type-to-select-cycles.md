---
'@astryxdesign/core': patch
---

[fix] MultiSelector: in the open list, type-to-select now works as Selector's does. A letter pressed again moves to the next option that starts with it, so `t`, `t`, `t` over Tea, Toast and Tofu walks Toast, Tofu, Tea instead of staying on Tea. A single letter typed after a pause searches from the option after the highlighted one, not from the top of the list. `useMultiCombobox` gets the same behavior. (#9921)

@HelloOjasMutreja
