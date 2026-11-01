---
'@astryxdesign/core': patch
---

[feat] `reset.css`'s box model now reaches `::backdrop`, the layer behind a modal dialog, a popover or a fullscreen element. A backdrop was `content-box` with no border style; like every element and `::before`/`::after`, it is now `border-box` with a `0 solid currentColor` border. Astryx's own backdrops look the same. A backdrop that sets `width` or `height` with padding or a border now includes them in that size. One that sets only `border-width` now draws a solid border in its text color, and one that sets only `border-style` no longer draws a border until it also sets a width.

To keep the old look, add `@layer reset { ::backdrop { box-sizing: content-box; border-width: medium; border-style: none; } }` after the `reset.css` import. In the `reset` layer, it still yields to any backdrop border your own styles set.

@vjeux
