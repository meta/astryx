---
'@astryxdesign/core': patch
---

[fix] Popover: an open popover no longer pulls in a Tab pressed elsewhere on the page. Keyboard users can move through the rest of the page in order while a popover is open, for example a list next to a non-modal comment popover. Focus inside the popover still cycles with Tab and Shift+Tab, and Escape still closes it and returns focus to its trigger. `useFocusTrap` applies the same rule: it holds focus that is inside its container and leaves Tabs that start outside to the page. This meets `component:Popover` DEC-9. Fixes #7687.

@cixzhang
