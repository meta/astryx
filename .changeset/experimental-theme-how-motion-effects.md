---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a motion effect apart from a speed:

- **Effects:** "fade in tooltips" and "slide in dialogs" now say what the part does now, read from Core's own animations and transitions (the tooltip fades in already). Nothing is written: the editor sets how long motion takes, not which effect a part uses.
- **Speed:** "faster" and "slower" step the motion the part has (a tooltip's animation) from the time it takes now.

@josephfarina
