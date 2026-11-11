---
'@astryxdesign/core': patch
---

[fix] Dialog, CommandPalette, BottomSheet, Lightbox, Drawer, MobileNav, Popover: a Tab pressed with Ctrl or Meta on the first or last control of a modal no longer moves focus to the other end, and the modal no longer cancels the press. A page or a host app that handles Ctrl+Tab or Meta+Tab itself, for example to switch its own tabs, now gets the press on every control, as it already did between the first and the last. Alt+Tab still wraps, because Safari moves focus to each item on Option+Tab.
@vjeux
