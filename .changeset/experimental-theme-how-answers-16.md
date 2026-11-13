---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a negated dark mode, undo of what is set, typed times and transforms, and the right targets.

- "Except in dark mode", "but not in dark mode" and "leave dark mode alone" change light mode only; "not pure black" is a near-black and "not pure white" a near-white.
- "Undo the corners" on a theme that sets no corners says there is nothing to undo.
- "animation-duration 0s" is 0ms; "translateY(-2px) on hover" is a transform on hover; "shrink headings by 20%" says set takes the new value; "fade in tooltips" says the tooltip has no motion of its own.
- "Why are my buttons black" is a lookup, never a change; "is my theme valid", "how many dials" and "list every change" get the command that answers them.
- "radius sm/lg", "setRadius(4)" and "½rem" are read as values; "#22c55e in light, #4ade80 in dark" sets the accent for each mode; two-word CSS color names ("midnight blue") are the CSS color.
- "Text on the accent is hard to read" sets the on-accent text color that reads in each mode; "5 lines tall text box" sets the text area's height in lines; "dropdown shadow" is the dropdown's menu; "checkboxes green" is the checked fill.

@josephfarina
