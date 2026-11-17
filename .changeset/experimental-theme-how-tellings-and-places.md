---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads four more kinds of clause:

- A comparison of what is there now tells and writes nothing ("in dark mode the cards look darker than the page, like holes"). The fix said after it keeps that mode, so "make cards slightly lighter" writes dark mode only.
- What a part should mark is read in that part ("the date picker should circle today in #0969da"), as after a label, never as a fill on the part.
- A part's own items said after its name ("pagination pages in one bordered strip") are that part's, never a screen named by what it shows.
- A part's list said as a likeness ("alerts like Bootstrap 1: …") is that part's, every item. "a text shadow" in it is `text-shadow` on the part's letters, never a box shadow or a theme-wide one.

@josephfarina
