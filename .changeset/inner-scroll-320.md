---
'@astryxdesign/cli': patch
---

[fix] Nine page templates fit a 320 px phone without their content scrolling sideways, and a tenth scrolls less. Their responsive grids now pair the minimum column width with a column cap, so a column narrower than the screen shrinks to fit instead of overflowing. The inline form wizard's checkbox descriptions now wrap instead of being cut to one line. Wide screens look the same as before.

@josephfarina
