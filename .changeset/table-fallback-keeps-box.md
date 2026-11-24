---
'@astryxdesign/core': patch
---

[fix] A Table given `useTableRowsVirtualization` keeps the height its parent gives it when its rows fall back to full rendering, for example for wrapped text. The fallback still renders every row, now in the Table's own scroll area inside that height. Before, the fallback sized the Table to all of its rows, so a sized parent had to scroll the whole Table or let it grow past. A columns capability alone, a caller-provided scroll wrapper and children mode are unchanged.

@humbertovirtudes
