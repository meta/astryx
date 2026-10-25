---
'@astryxdesign/core': patch
---

[fix] `Layout` no longer ships a `:has()` on the layout followed by a universal `*` selector for the padding that collapses next to a `LayoutHeader` or `LayoutFooter` without a divider. That selector shape can make a browser restyle everything inside the layout on each change within it, which costs the most in long documents. `LayoutHeader` and `LayoutFooter` now carry internal markers, and Layout's middle row reads them with sibling selectors. Rendering is unchanged for a Layout's own content, and a Layout nested in another Layout's content or panels still inherits the outer collapse. One case changes: a Layout nested inside a `LayoutHeader` or `LayoutFooter` that has no divider no longer takes that outer collapse, so its content keeps its own inner padding beside its own divider (16px at the default spacing) instead of 0px.

@cixzhang
