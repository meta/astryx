---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an ask for neutral grays ("neutral grays", "make the grays neutral", "pure neutral grays, no tint") now reads as grays with no hue of their own. When the theme's grays already have none, the answer says so and writes nothing. When they are tinted (a warm or cool gray), it gives the neutral color as a plain gray: the page, surfaces, cards, text and borders lose their tint in both modes, and a part the theme sets itself keeps its own color. When the only tint is in a page or surface color the theme sets itself, the answer names that token and writes nothing. Before, the ask only explained the neutral color, refused ("no part is called gray"), or set the hover tint. A gray named with a hue ("cool neutral grays", "neutral grays with a blue tint") or given a typed color ("neutral grays: #64748b") keeps its own reading. An ask turned away from the grays ("never neutral grays", "remove the neutral grays", "neutral grays are too cold") does not get the plain gray. In an ask of several clauses, a line that says something new now comes before change lines that repeat commands an earlier line gives, and a line that says a clause is in place already comes after the new changes, before the repeats. The first line does not change.

@josephfarina
