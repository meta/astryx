---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feature] Add fixed-height flat-data Table virtualization through `useTableRowsVirtualization({rowHeight, viewportHeight})` and `Table.virtualization`. Keep complete data and canonical identity in Table, preserve logical row positions, retain focused rows, and fall back to full rendering for unsupported content or geometry. Existing tables do not opt in automatically.

@humbertovirtudes
