---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a state setting on a part (`font-weight 500 --on tab --state selected`) wins over the build's copy of the plain part's value, which the build no longer writes after it; and `how` keeps a state at the value the part shows in that state (a selected tab's semibold).

A shadow on the resting rule of a part that draws its rings in its box-shadow (a text input's hover and focus rings) is refused with that reason, in both modes or one, since it would replace the rings in every state.

@josephfarina
