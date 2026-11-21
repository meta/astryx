---
'@astryxdesign/core': patch
---

[feat] `Item` gains `controlProps`: attributes for the control the row renders for `onClick` or `href` (the invisible button or anchor the label sits in, where keyboard focus lands). A disclosure row's `aria-expanded`, `aria-haspopup` and `aria-controls`, a toggle's `aria-pressed`, a name of its own (`aria-label`, `aria-labelledby`), a host's `data-*` marks, `onKeyDown` and a composite's roving `tabIndex` reach the focused control instead of the root, where a screen reader does not read them. The row's own attributes win where they conflict (`aria-disabled` is the row's own, from `isDisabled`: a disabled row's control says so and does not activate, and keeps the enabled row's focus order, or the `tabIndex` these set); where the root is the link (`as`, with or without a `role`), they land on the root after the row's other props, the row's disabled state still winning, and never on an invisible button nested inside that root; a row given no `controlProps` renders exactly what it did before; a row that renders no control (a `role` on a plain root, an `interactiveRef`, a link root included) ignores them with a development warning. `ListItem` passes the prop through unchanged. Type `ItemControlProps` is exported.

@vjeux
