---
'@astryxdesign/core': patch
---

[fix] A `Selector`'s open option list is now named by the field's label in every presentation. In the popover it was named by the trigger, so a screen reader announced the list as the selected value (for example "Banana" instead of "Fruit").

@cixzhang
