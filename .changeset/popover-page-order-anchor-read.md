---
'@astryxdesign/core': patch
---

[fix] `usePopover`: a `tabBehavior: 'pageOrder'` popover with no trigger, whose layer element mounts again while the popover is open, follows the anchor that `anchorRef` holds then in the Tab order (WCAG 2.2 SC 2.4.3, Focus Order). Before, it followed the anchor from the render before.

@nynexman4464
