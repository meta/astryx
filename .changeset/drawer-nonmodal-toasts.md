---
'@astryxdesign/core': patch
---

[fix] A toast shown before a `Drawer` without its scrim (`hasScrim={false}`) opens now stays above the drawer, as it already does above a scrimless `BottomSheet`. Before, the drawer painted over it, so where the drawer covered the toast's corner its action could not be seen or pressed.

@cixzhang @duytbp
