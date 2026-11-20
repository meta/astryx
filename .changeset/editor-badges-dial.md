---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a `badges` setting styles the badges together in the theme's own colors: `solid` and `outline` style the status and category badges, `soft` styles the status badges, and a badge whose own colors do not read on the base falls back to a pair that reads, where one exists, and the result names it. A property the theme sets on the badge itself stays. `how` answers a badge style with it. The corners dial now gives badges the element corners at any corners but pill, as it gives buttons; a base theme that rounds its badges itself keeps that shape except at square, which squares every pill. Inside a primary or destructive button, the badges `soft` and `outline` draw (status badges under `soft`, every badge under `outline`) take the button's colors.

@josephfarina
