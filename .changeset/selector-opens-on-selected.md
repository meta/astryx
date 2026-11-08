---
'@astryxdesign/core': patch
---

[fix] `Selector` and `useCombobox`: opening a closed list starts on the selected option, as the WAI-ARIA listbox pattern asks, and never on a disabled option. Before, ArrowDown and ArrowUp opened on the first or last option even when it was disabled, and ArrowDown then Enter changed "Hard" to the first option. Now opening highlights the selected option when it is enabled. Otherwise ArrowUp opens on the last enabled option and ArrowDown, a press, Enter or Space on the first; with no enabled option nothing is highlighted. A search list opened by a press, Enter or typing still highlights nothing. `MultiSelector` is unchanged.

@cixzhang
