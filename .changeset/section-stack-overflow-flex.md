---
'@astryxdesign/core': patch
---

[feat] Section `isScrollable` and StackItem `minWidth` for multi-pane layouts (#2623)

`Section` gains the `isScrollable` prop that `LayoutContent`, `LayoutPanel`, `Stack` and `StackItem` already had. The scroll goes on the section's inner painted surface, so the background, dividers and padding stay put while the content scrolls, and the outer box gets the flex `min-height: 0` / `min-width: 0` reset so a section inside a Stack scrolls instead of growing. `StackItem` gains `minWidth` (the same `SizeValue` vocabulary as Stack's `width` / `maxWidth`): `size="fill" minWidth={320}` grows into the free space but never shrinks below 320px, so the parent strip scrolls instead. Wrap each pane's Section in a StackItem that carries the sizing, and give the Section `height="100%"` so it fills the item.
@AKnassa
