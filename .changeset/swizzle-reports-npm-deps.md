---
'@astryxdesign/cli': patch
---

[fix] `astryx swizzle` reports the npm packages a copy imports, such as `d3-scale` for a chart, with the version range the owner package declares, so the copy builds once you install them. The `swizzle.copy` receipt lists them in `dependencies`, and the text output names them to install. Node's built-in modules and the owner package itself are not listed.

@cixzhang
