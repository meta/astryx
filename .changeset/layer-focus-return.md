---
'@astryxdesign/core': patch
---

[fix] Popover, Dialog and DropdownMenu return focus through one rule when they close, and focus no longer falls to the page when the control that opened them is gone. Focus goes to the opener; if the opener is gone, it goes to its replacement (a trigger that remounted, or the control that took its place in the same group), then the anchor, then the nearest surviving ancestor, then the layer that opened this one, then the page's `main` region. A Dialog opened from a menu row returns focus to the menu's trigger. Focus that you or the person already moved outside the closing layer stays where it is. There is no option to turn focus return off; to send focus somewhere specific, focus it in `onOpenChange` or `onHide`. Focus returns before the browser's own restore, so the trigger gets a focus ring only after keyboard input.

@nynexman4464
