---
'@astryxdesign/core': patch
---

[fix] A cut Hebrew or Arabic label in a Badge, a static Token (with or without Remove) or a link Token without Remove keeps its start on a left-to-right page, as other cut labels do. A clickable Token and a link Token with Remove still clip their label at the inner control. A label that mixes both scripts follows the page as before.

@cixzhang
