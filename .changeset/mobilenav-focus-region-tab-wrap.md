---
'@astryxdesign/core': patch
---

[fix] MobileNav: Tab now wraps inside the open navigation drawer. Tab from the last control moves to the first, and Shift+Tab from the first moves to the last, so keyboard and screen-reader users on a phone no longer land in the browser's toolbar from inside the drawer. The drawer uses the same focus-region module as Dialog, BottomSheet and Lightbox.

@cixzhang
