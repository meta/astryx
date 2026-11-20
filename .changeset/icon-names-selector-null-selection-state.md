---
'@astryxdesign/core': patch
---

[docs] Docs now answer three questions in the first sentence that agents read:

- Icon props such as TextInput `startIcon`, Selector `startIcon`, Field `labelIcon`, DropdownMenuItem `icon` and SideNavItem `icon` take a semantic icon name such as `'search'` (see `astryx docs icons`), an icon component, or an icon element. Their documented type is now `ReactNode | IconType`, as in the code.
- Selector `value` and `onChange` show the `hasClear` types: with `hasClear`, `value` is required and `string | null`, and `onChange` receives `null` when the user clears the selection.
- useTableSelectionState names what it returns: `selectionConfig` and `selectionState` with `selectedKeys`, `selectedCount`, `hasSelection` and `clearSelection`, with a bulk-action example.

No API or behavior changes.

@josephfarina
