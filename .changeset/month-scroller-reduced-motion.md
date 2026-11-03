---
'@astryxdesign/core': patch
---

[fix] With Reduce Motion on (`design:reduced-motion`), the month arrows in the DateInput and DateTimeInput bottom-sheet calendars, Reset, and a keyboard move into another month no longer scroll the months: on a computer with a mouse or trackpad the month changes at once, and on a touch screen it changes through a short opacity dip. A second step during the dip replaces the first, and unmounting the calendar during the dip scrolls nothing.

@vjeux
