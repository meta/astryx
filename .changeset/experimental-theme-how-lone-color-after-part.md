---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a list piece that is only a color, said after a part that draws with the accent, such as a button, a checkbox or a switch, is that part's fill, never the whole theme's accent ("big buttons, a sky blue, high contrast" fills the buttons, where the color was not used before). A color led by another piece of the part before goes to that piece ("warning banner title black, description dark gray" sets the description's color too), and a color inside a look is the look's tint, never a piece of its own ("frosted blue glass"). As before, after a part that is only text, or one with a plain fill, the color is that part's text or fill ("bold headings, dark gray", "rounder cards, white"); after any other part ("bigger icons, red") it reads as it did; a typed value there ("bigger buttons, #2563eb") is still not used; and a piece that names a role or variant ("red and blue accents", "primary blue") is read by the role and variant readers.

@josephfarina
