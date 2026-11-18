---
'@astryxdesign/core': patch
---

[fix] The switch thumb rests as far from the track's end as from its top and bottom, at both ends, with a mouse and under a finger, read from the track's and the thumb's own sizes. A theme that sizes the track (`width` and `height` on `switch`) or the thumb (on `switch-thumb`) now keeps the thumb at the ends, where before it stopped short or ran past the end, and under a finger jumped at release. Two states move 1px to follow that one rule: the small switch's off thumb with a mouse sits 3px from the start (as under a finger), not 2px; and in forced colors (high contrast) the on thumb sits 2px from the end instead of touching the track's border. Everything else draws the same pixels in every official theme.

@josephfarina
