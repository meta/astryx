---
'@astryxdesign/core': patch
---

[fix] BottomSheetSwitcher: a flow without its scrim (`hasScrim={false}`) that closes with focus inside it now returns focus to the element that opened it, as a standalone sheet without its scrim does, instead of leaving focus in the hidden sheet. A switcher removed while a sheet is open, with or without its scrim, now returns focus to the flow's opener when focus was inside the flow or fell to the page body, instead of leaving it on the body.

@cixzhang
