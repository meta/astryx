---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a focus ring request keeps its scope ("focus ring on inputs only" sets the ring's tokens `--on inputs`, the other parts keep theirs), and an exact amount ("half", "double", "twice", "50% strength", "x0.5") is worked out from the theme's own value: the ring's width, a part's corner radius or its padding when the theme sets one. An amount alone after a comma ("…, at half strength") belongs to the ask before it. A comparison ("cards with twice the padding of buttons") is of the other part's value, when the theme sets one; otherwise the answer is a step and says so. The answer names the value it starts from and, for "strength", that it reads it as the ring's width.

@josephfarina
