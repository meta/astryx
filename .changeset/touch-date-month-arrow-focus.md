---
'@astryxdesign/core': patch
---

[fix] DateInput's touch sheet keeps keyboard focus when a month arrow reaches the end of the range. The arrow hides there, so focus now moves first to the other month arrow, or to the month-and-year button when both arrows hide. Before, focus fell to the page.
