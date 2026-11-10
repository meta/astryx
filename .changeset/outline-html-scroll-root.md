---
'@astryxdesign/core': patch
---

[fix] Outline: on a page that scrolls the viewport through `<html>` (`html { overflow-y: scroll }` or `auto`), or through a `<body>` that gives its overflow to the viewport, the current heading now follows the page scroll, a link press with `offset` lands its heading below the fixed header, and `onNavigateEnd` fires when the scroll ends. The outline used to take that element as its scroll container, but the page scroll reports to the window, so the current heading stayed on the first one and an `offset` landing overshot by the scroll position. A `<body>` that scrolls a box of its own, under an `<html>` that clips, still drives the outline.

@oyobbeb
