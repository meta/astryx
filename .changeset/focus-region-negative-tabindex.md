---
'@astryxdesign/core': patch
---

[fix] A modal Dialog, BottomSheet, Lightbox or MobileNav no longer lets Tab escape when a button or link with `tabindex="-1"` comes last or first, as the other members of a roving group (a radio group, a toolbar) do. Tab from the last real stop now wraps to the first, and Shift+Tab from the first wraps to the last, skipping those buttons.

@jimmyallinai @cixzhang
