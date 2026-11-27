---
'@astryxdesign/core': patch
---

[fix] Dialog, BottomSheet, BottomSheetSwitcher, Lightbox, DropdownMenu: when one closes and returns focus to a contenteditable region or to an audio or video player with controls that the page scrolled out of view, the page now scrolls just enough to show it, as it does for a button.

@cixzhang
