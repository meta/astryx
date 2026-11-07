---
'@astryxdesign/core': patch
---

[feat] TreeList: new `renderExpandIcon` prop to customize the expand/collapse indicator. It is called per item with `{isExpanded, hasChildren, isDisabled}`, so a file tree can render closed/open folder icons on expandable rows and a file icon in the indicator slot of leaves. Custom icons swap per state instead of rotating (the chevron rotation animation is suppressed); returning null falls back to the default chevron for parents and to no indicator for leaves. Custom icons sit in the default chevron's column (`--spacing-4`, 16px by default), so `sm` icons fill it at the default spacing. Trees that do not pass `renderExpandIcon` render exactly as before. The toggle's accessibility wiring (aria-expanded, aria-label, roving tabindex, `data-tree-toggle`) is unchanged regardless of the icon rendered inside it. Also exports the `TreeListExpandIconState` type. See #4131.

@AKnassa
