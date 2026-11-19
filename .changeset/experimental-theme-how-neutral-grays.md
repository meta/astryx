---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an ask for neutral grays ("neutral grays", "make the grays neutral", "pure neutral grays, no tint") now reads as grays with no hue of their own. When the theme's grays already have none, the answer says so and writes nothing. When they are tinted (a warm or cool gray), it gives the neutral color as a plain gray: the page, surfaces, cards, text and borders lose their tint in both modes, and a part the theme sets itself keeps its own color. Before, the ask only explained the neutral color, or set the hover tint. A gray named with a hue ("cool neutral grays") keeps its own reading. In a long ask, a clause whose only answer is a line of its own now comes before lines that repeat commands an earlier line already gives, so that clause is not cut from the answer.

@josephfarina
