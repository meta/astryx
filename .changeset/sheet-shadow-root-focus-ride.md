---
'@astryxdesign/core': patch
---

[fix] BottomSheet: in iOS Safari, focus moving from a Tall sheet's field to a plain button inside a web component now rides the content down from the blur, as focus moving to any other control that brings up no keyboard does. A frame, or a custom element that can hold a field the page cannot see, still keeps the content in place.

@vjeux
