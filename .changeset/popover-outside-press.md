---
'@astryxdesign/core': patch
---

[feat] Popover and `usePopover` take `onOutsidePress`. It is called for each press outside an open popover before the popover closes, and `event.preventDefault()` keeps the popover open. Use it when the press lands on a control that switches what the popover shows. The press itself still reaches the page. A press on a separate `anchor` counts as outside; a press on the trigger does not.

@nynexman4464
