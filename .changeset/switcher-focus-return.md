---
'@astryxdesign/core': patch
---

[fix] BottomSheetSwitcher: a flow without its scrim (`hasScrim={false}`) that closes with focus inside it now returns focus to the element that opened it, as a standalone sheet without its scrim does, instead of leaving focus on the page body. A switcher with its scrim that is removed while a sheet is open now returns focus to the flow's opener, when the removal lost focus, instead of leaving it on the page body.

@cixzhang
