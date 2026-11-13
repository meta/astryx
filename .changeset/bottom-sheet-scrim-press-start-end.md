---
'@astryxdesign/core': patch
---

[fix] A `BottomSheet` with `purpose="info"` and its scrim, and a `BottomSheetSwitcher` step with its scrim, now close on a backdrop press only when the press both starts and ends on the scrim (`family:overlay-dismissal` FR10). Selecting text in a field or dragging a control past the sheet's edge no longer closes the sheet and loses user input. A press on the scrim alone still closes it, with a mouse, a pen, or a finger.

@MuhammadAusafJamal @duytbp
