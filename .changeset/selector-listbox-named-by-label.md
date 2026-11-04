---
'@astryxdesign/core': patch
---

[fix] A `Selector`'s open option list is now named by the field's label in every presentation. In the popover without search, the list was named by the trigger, so a screen reader announced the selected value, or the placeholder when nothing was selected (for example "Banana" instead of "Fruit"), against WCAG 2.2 SC 4.1.2. `getByLabelText(<label>)` now matches the list as well as the trigger. (#9737)

@cixzhang
