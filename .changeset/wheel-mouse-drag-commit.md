---
'@astryxdesign/core': patch
---

[fix] Dragging a picker wheel with a mouse now commits the value when the button is released, as a finger's drag does. Before, the wheel committed every row it passed while the button was still down, so in DateInput the calendar behind the month and year wheels changed under the hand. This applies to the wheels in the TimeInput, DateTimeInput and DateInput bottom sheets. Touch, keys and a click on a row are unchanged.

@vjeux
