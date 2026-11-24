---
'@astryxdesign/core': patch
---

[fix] A spoken name read from rendered text (a Table column's resize handle, a List reorder announcement, a tooltip's description) now keeps a block apart from the text beside it when an inline element holds the block: `['x', <span><div>A</div></span>, 'y']` reads "x A y", as the page shows it, where it read "xAy".

@cixzhang
