---
'@astryxdesign/core': patch
---

[fix] `Table`: three of its keyboard tab stops draw the theme's focus ring instead of the browser's default: the scroll wrapper once the table scrolls inline, and the tree plugin's row expander and expand-all toggle. A theme's `--focus-outline-*` tokens now reach them. The scroll wrapper's ring sits inside its box, clear of a bordered Card's border, so a Card no longer cuts off its edges (a Card's rounded corners still trim the ring's square corners); at `density="compact"` the tree toggles' ring sits inside the toggle, so the row does not clip it. The row-expansion, grouped-rows and filter buttons are unchanged.

@cixzhang
