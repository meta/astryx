---
'@astryxdesign/cli': patch
---

[docs] New block, "Table — Selection in the Leading Mark": row selection with no checkbox column. Each row shows its avatar, and the checkbox takes the avatar's slot while a mouse is over it, on keyboard focus, and on every row once anything is selected. It uses the existing `useTableSelectionState` and renders the checkboxes in the name column, so no new Table API is involved.

@cixzhang
