---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` now gives a text color for every variant of a part ("buttons with white text", "badges with dark text") to each variant only in the modes where it reads. It measures against the variant's own fill, see-through fills over the page, or the fill the same answer gives it. Variants it can't read on keep their own text, and the answer says which.

Other fixes:

- "tinted <color>" fills with the color at a low strength over what's beneath, not the solid color.
- A rule with its own verb said after a part's clause ("3px corners on cards, never use pure black for text") now applies to the whole theme.

@josephfarina
