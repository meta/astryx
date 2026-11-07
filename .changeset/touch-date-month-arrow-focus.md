---
'@astryxdesign/core': patch
---

[fix] DateInput's touch sheet keeps keyboard focus when the month reaches the end of the range, by an arrow press or a swipe, while a month arrow holds focus. That arrow hides there, so focus now moves first to the other month arrow, or to the month-and-year button when both arrows hide. Before, focus fell to the page.

@cixzhang
