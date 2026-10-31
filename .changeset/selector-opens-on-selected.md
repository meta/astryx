---
'@astryxdesign/core': patch
---

[fix] `Selector` and `MultiSelector`: opening a closed list never highlights a disabled option. `Selector` opens on the selected option with every key, so ArrowDown then Enter keeps "Hard" selected instead of switching to the first option. With nothing selected (and always in `MultiSelector`), ArrowDown, a press, Enter and Space open on the first enabled option and ArrowUp on the last; with no enabled option nothing is highlighted. `useCombobox` and `useMultiCombobox` open the same way.

@cixzhang
