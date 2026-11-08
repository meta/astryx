---
'@astryxdesign/core': patch
---

[fix] PowerSearch's phone sheet now edits single and multiple choices with the standard RadioList and CheckboxList at their usual spacing, instead of its own 48 px rows, and its Operator radios put the radio at the start of the row, as every RadioList does. The choices use the shared touch band, so their touch targets are smaller than before. End, Home and Enter no longer pick a choice; the arrow keys and Space work as in any RadioList or CheckboxList. Adds a "Sheet presentation · realistic config" story that covers every value type. The desktop editor popover is unchanged.

@cixzhang
