---
'@astryxdesign/core': patch
---

[feat] A `usePopover` surface that hides while its anchor is out of view (`anchorOutOfViewBehavior: 'hideWhileOutOfView'`) moves focus inside it out as it hides: to the anchor when it is an HTML element that can take focus, else to the trigger. Focus is not moved back when the surface shows again.

@nynexman4464
