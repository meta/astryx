---
'@astryxdesign/core': patch
---

[docs] The Table, Table plugin and useToast docs now answer common questions without the package source:

- Table documents its `emptyState` prop, how to open a row from a link or button in its main cell (Table has no row-click prop), and what a custom `TablePlugin` can change, in which order.
- useTableFiltering documents its required `searchConfig` and shows that you filter the rows yourself, with an empty state for no matches; useTableFilterState names `clearAll`.
- useTableSelection explains how `getIsItemSelectable` (no checkbox) differs from `getIsItemEnabled` (a disabled checkbox) and what select-all does with each.
- useToast lists every `ToastOptions` field with its default, and says it returns the show function itself (`const showToast = useToast()`), not an object.

No API or behavior changes.

@josephfarina
