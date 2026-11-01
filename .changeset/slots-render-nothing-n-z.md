---
'@astryxdesign/core': patch
---

[fix] More slots treat `''`, `false` and `true` as empty, the way React renders them, instead of drawing an empty wrapper: TreeList's `header` (a header that renders nothing no longer names the tree, so it keeps its `aria-label`), TreeList items' `startContent` and `endContent`, TopNavMegaMenu's `items` and `featured`, Table header `after` content, and OverflowList's measured overflow indicator. `0` still counts as content and shows "0".

@czarandy @humbertovirtudes @rubyycheung
