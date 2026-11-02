---
'@astryxdesign/core': patch
---

[fix] `Table`: its own keyboard tab stops draw the theme's focus ring instead of the browser's default. That covers the scroll wrapper once the table scrolls inline, and the tree plugin's row expander and expand-all toggle. A theme's `--focus-outline-*` tokens now reach them. The scroll wrapper's ring sits inside its box, so a Card no longer cuts it off.

@cixzhang
