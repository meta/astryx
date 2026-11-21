---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a list piece that is only a color, said after a part, goes to the piece of that part it names first ("warning banner title black, description dark gray" sets the description's color too, where it was dropped). As before, a color after a part that draws with the accent, such as a button, a checkbox or a switch, is that part's fill, never the whole theme's accent ("rounded checkboxes, navy"); after a part that is only text, or one with a plain fill, it is that part's text or fill ("bold headings, dark gray", "rounder cards, white"); a color inside a look stays part of that look ("frosted blue glass" writes the glass look); a typed value ("bigger buttons, #2563eb") is not used; and a piece that names a role or variant ("red and blue accents", "primary blue") is read by the role and variant readers.

@josephfarina
