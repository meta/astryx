---
'@astryxdesign/core': patch
---

[feat] `LayoutPanel`, `ResizeHandle` and `SideNav` take `useResizable`'s output directly in their `resizable` prop: `const resizable = useResizable({…}); <LayoutPanel resizable={resizable}>…</LayoutPanel> <ResizeHandle resizable={resizable} />`. The output's `props` still works, and `SideNav`'s `true` and config object are unchanged. Given the output, `SideNav`'s rail follows the region: its width and collapse state come from the region, its toggle calls the region's `collapse` and `expand`, and the region's `autoSaveId` saves the width. When `collapsible` also sets a collapsed state, the region wins and `SideNav` warns in development. Any other element can use the hook's `size`; the Resizable docs show one sized with a StyleX dynamic style.

@vjeux
