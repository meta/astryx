---
'@astryxdesign/core': patch
---

[fix] On a touch screen with a mouse, after a finger opens a menu, a dialog, a drawer, a mobile nav or a popover, a click with a mouse that has not moved since reaches what is under it while the layer enters. Before, that click landed on the entrance's input hold and did nothing. A finger's or a pen's tap during the entrance is still ignored. A mouse that has sent no pointer event since the page loaded still meets the hold.

@vjeux
