---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns, at its line and with the form that works, a part key it cannot write as intended: a pseudo key that leaves a parenthesis, bracket, quote or comment open (a browser then drops the rules after it), a pseudo key that is no selector, a selector list such as `':hover, :focus'` (only its first member is scoped to the part), and a custom property with capitals (written in kebab case, so `var()` of the name as written reads nothing). The output is the same as before. A missing input near a theme source in the same folder (a missing extension, a one-letter slip) is offered that source.

@josephfarina
