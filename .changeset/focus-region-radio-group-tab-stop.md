---
'@astryxdesign/core': patch
---

[fix] Dialog, AlertDialog, CommandPalette, BottomSheet, Lightbox, Drawer, MobileNav, Popover: Tab no longer escapes a modal through a radio group. The browser gives a same-name group of native radios one Tab stop: its checked radio, or its first when none is checked. The focus region now finds its first and last stops the same way. Before, Tab from a group's checked radio left the modal for the browser's toolbar when the group ended the modal and that radio was not last in it, and Shift+Tab did the same when a group started it. Reported by @duytbp.

@cixzhang
