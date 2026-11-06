---
'@astryxdesign/core': patch
---

[fix] A `LayoutPanel` whose width is the number 0, such as one given a collapsed `useResizable` region's `resizable` props or `width={0}`, now takes no space and shows none of its children. Before, its padding kept it about 32px wide and its children showed squeezed into that strip, one letter per line. This is visual only: keyboard and assistive-technology hiding for a collapsed panel is separate.

@vjeux
