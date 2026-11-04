---
'@astryxdesign/core': patch
---

[fix] In the DateInput, TimeInput and DateTimeInput bottom sheets, a wheel's Arrow, Page, Home and End keys move through its enabled values in time order, skipping disabled ones, and stop at the first or last enabled value, with a mouse as with a finger. On a 12-hour hour wheel 12 PM comes before 1 PM, so ArrowDown from 12 PM moves to 1 PM, and a key past the last allowed hour commits nothing.

@vjeux
