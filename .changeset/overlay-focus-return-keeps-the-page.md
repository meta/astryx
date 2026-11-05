---
'@astryxdesign/core': patch
---

[fix] BottomSheet and Dialog: the page no longer jumps after a sheet or a dialog closes in Safari and on iOS. Returning focus to the control that opened the overlay asks the browser not to scroll. WebKit focuses the nearest focusable ancestor of a tapped button, such as an app's `tabindex="-1"` main region, and records it as the opener; the focus return then scrolled the page to that region's top edge. The focus ring still follows the last input.

@imdreamrunner
