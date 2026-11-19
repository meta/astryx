---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` gives a missed part one line where one setting reaches it: a toast's text picks its own side from its fill, so its surface alone is the line. Where a line takes two settings (a tooltip's surface, then its text), the problem the first step leaves says that the next step of that line clears it, and names the step. An error toast's line for the danger color takes the text that reads on the new red where the toast's own pick would not, so following it makes no problem.

@josephfarina
