---
'@astryxdesign/core': patch
---

[fix] Selector ignores option selections after it becomes disabled, including selections from an already-open popup and pointer gestures started while enabled. Its open search input, search clear button, and sheet listbox retain focus and expose disabled state and any reason without accepting search edits or clearing. Its trigger remains focusable and disabled values remain excluded from forms.
@korkt-kim
