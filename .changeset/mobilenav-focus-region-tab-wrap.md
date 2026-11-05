---
'@astryxdesign/core': patch
---

[fix] MobileNav: Tab now wraps inside the open navigation drawer. Tab from the last control moves to the first, and Shift+Tab from the first moves to the last, so keyboard users no longer move from inside the drawer to the browser's toolbar. The drawer uses the same focus-region module as Dialog, BottomSheet and Lightbox.

@cixzhang
