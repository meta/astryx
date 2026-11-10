---
'@astryxdesign/core': patch
---

[docs] HoverCard: a trigger inside SVG `<foreignObject>` cannot be a CSS anchor in Chromium, so its card opens at the viewport corner. The docs now say so and show the fix: render the trigger in an HTML layer positioned over the SVG node.

@cixzhang
