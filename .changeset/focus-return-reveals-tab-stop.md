---
'@astryxdesign/core': patch
---

[fix] Dialog, BottomSheet, BottomSheetSwitcher, Lightbox, DropdownMenu: when one closes and focus returns to a button or other Tab stop that the page scrolled out of view, the page now scrolls just enough to show it, so a keyboard user's next key acts where they can see it. A return target that is not a Tab stop, such as a region that Safari focuses after a tap, is still never scrolled to, and neither is a Tab stop larger than the screen. In Safari and current Chrome, opening a DropdownMenu from the keyboard already scrolls the page to show the menu, so its button is in view, nearer the middle of the screen, when the menu closes.

@cixzhang
