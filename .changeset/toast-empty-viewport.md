---
'@astryxdesign/core': patch
---

[fix] An empty toast viewport now has no box, so iOS Safari's bottom toolbar returns to the page color once the last toast leaves. Before, a toast swiped out through the bottom edge left its color on the toolbar until the page reloaded. (#8047)

@vjeux
