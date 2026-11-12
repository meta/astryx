---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: "2px rounder" is a change from the corners now, and "all corners like the buttons" copies the buttons' radius.

- An amount with a comparative ("2px rounder", "2px sharper", "8px larger") is a change from the value now: the theme's corners move from its own current radius (its settings applied, not the base theme's), and a part's corners move from the radius token it reads. Anywhere else ("4px wider") how says set takes the new value instead of setting the amount.
- "All corners like the buttons" sets every other radius token to the one buttons read.

@josephfarina
