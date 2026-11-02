---
'@astryxdesign/core': patch
---

[fix] A `resizable` `SideNav` keeps its nav and items mounted when it collapses or expands, as a plain one does. Before, every collapse remounted them, so an open nested group closed and item state reset.

@cixzhang @duytbp
