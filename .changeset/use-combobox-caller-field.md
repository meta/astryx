---
'@astryxdesign/core': patch
---

[feat] `useCombobox` (from `@astryxdesign/core/Selector`) now builds a combobox over a single-line text field you render yourself, such as a search field whose results replace a page section or an “add people” field in a dialog. Spread `getFieldProps` on your `input`, `getListboxProps` on your listbox wherever it renders, and `getOptionProps` on each option. Focus stays in the field; the field and the list carry the combobox roles and relationships; while the list shows, the arrows move the active option, Enter picks it and Escape hides the list without closing a surrounding dialog; while it is hidden, ArrowDown reopens it; while an input method is composing, keys reach the field untouched; a pointer picks without taking focus. Announce each new result count yourself through `useAnnounce`, with the words the field shows when nothing matches. Options may be any type with a string `value`. Existing options, return fields and `onKeyDown` behave as before.

@vjeux
