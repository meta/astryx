---
'@astryxdesign/core': patch
---

[feat] A table row that `useTableSelection` selects carries the `table-row` target's `selected` theme state, so a theme can style selected rows (`components: {'table-row': {selected: {…}}}`). The selection wash stays as it was; a theme recolors it by setting `--color-accent-muted` in that state.

@josephfarina
