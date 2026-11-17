---
'@astryxdesign/core': patch
---

[feat] A body row of a data-driven `Table` carries the `table-row` target's `parity` (`data-parity="odd"` for the first, third, … row; `"even"` for the others), and a body row of an `isStriped` table carries its `striped` state, so a theme can style either stripe, for example odd-row striping only where the app stripes: `components: {'table-row': {'parity:odd+striped': {backgroundColor: '#f9f9f9'}}}`. Core's own stripe stays on even rows and the default look is unchanged. Rows a caller places in a `TableBody` (children mode) carry `striped` but no `parity`.

@josephfarina
