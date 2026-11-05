---
'@astryxdesign/core': patch
---

[fix] MultiSelector: in the open list, a repeated letter now moves to the next option that starts with it, so `t`, `t`, `t` over Tea, Toast and Tofu walks Toast, Tofu, Tea instead of staying on Tea. A single letter typed after a pause searches from the option after the highlighted one, not from the top of the list, as in Selector. Space still toggles the highlighted option, so a typed Space does not extend the prefix as it does in Selector. `useMultiCombobox` gets the same behavior. (#9921)

@HelloOjasMutreja
