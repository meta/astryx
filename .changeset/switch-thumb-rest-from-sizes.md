---
'@astryxdesign/core': patch
---

[fix] The switch thumb rests as far from the track's end as from its top and bottom, at both ends, with a mouse and under a finger, read from the track's and the thumb's own sizes. A theme that sizes the track (`width` and `height` on `switch`) or the thumb (on `switch-thumb`) now keeps the thumb at the ends, where before it stopped short or ran past the end, and under a finger jumped at release. The control's box now follows the track too: before, it stayed 32 by 20 or 40 by 24 and squeezed a wider track back to that width. To follow that one rule, the small switch's off thumb with a mouse sits 3px from the start (as under a finger), not 2px; and in forced colors (high contrast) every thumb moves up to 1px so it sits as far from its end as from the top: the on thumb with a mouse moves 1px in from the end, so it no longer touches the track's border, and the medium off thumb with a mouse and every thumb under a finger move 1px toward their end. Everything else draws the same pixels in every official theme.

@josephfarina
