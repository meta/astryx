---
'@astryxdesign/core': patch
---

[fix] A Table plugin's `transformScrollWrapper` className and style now reach the table's scroll container, beside the wrapper's own class and styles. Before, the wrapper replaced them, so a plugin could not style the scroll container.

@cixzhang
