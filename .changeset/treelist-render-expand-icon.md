---
'@astryxdesign/core': patch
---

[feat] TreeList: a new `renderExpandIcon` prop customizes the expand/collapse indicator, for a folder-like tree. It is called per item with `{isExpanded, hasChildren, isDisabled}`, so a file tree can show a closed or open folder on rows that expand and a file icon on leaves, in the same column. The result replaces only the chevron glyph and renders as given, with no rotation or mirror; a glyph that points can read `useDirection()` from `@astryxdesign/core/i18n`. Return `undefined` to keep the default chevron (and no indicator on a leaf); any other result, `null` included, fills the column's box. The result is decorative (hidden from assistive technology, never focusable), and the row keeps its name, `aria-expanded` state and keys. Size icons `sm`, since the column is the default chevron's box (`--spacing-4`, 16px by default). Trees that do not pass `renderExpandIcon` render exactly as before. Also exports the `TreeListExpandIconState` type.

@AKnassa
