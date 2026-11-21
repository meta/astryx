---
'@astryxdesign/core': patch
---

[fix] A Popover no longer detaches and attaches its trigger, and sets state, after every render. It attaches a trigger again only when the trigger element, or the open state or ids the trigger shows, change, so a trigger the caller swaps or remounts is still attached, and an inline `onOpenChange` no longer causes a re-attach.

@cixzhang
