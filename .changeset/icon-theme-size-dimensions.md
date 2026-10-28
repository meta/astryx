---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] A theme sets the dimension of each Icon size: `width` and `height` in `px` or `rem` on `components.icon['size:sm']` (or `xsm`, `md`, `lg`) resize that size's glyph, for semantic icon names and for SVG components passed to `Icon`, in runtime and built themes alike. Before, those properties sized the box around a semantic icon but not its 1em artwork, and an app that compiles StyleX without CSS layers let the icon's own size win over the theme. A size the theme does not style still renders at 12, 16, 20, or 24px at a 16px root and scales with the root font size. `astryx docs theme` gains an Icon sizes section.

@imdreamrunner
