---
'@astryxdesign/core': patch
---

[docs] Grid's `align` and `justify` docs no longer claim a `'stretch'` default. Unset, they leave the browser default, `normal`, which stretches items that have no natural size or aspect ratio. Rendering is unchanged.

@cixzhang
