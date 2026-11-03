---
'@astryxdesign/core': patch
---

[fix] Button, IconButton: a tooltip that repeated the button's accessible name was also added as its description, so screen readers read the same words twice ("Close, button, Close"). Astryx's own close, pagination, copy and collapse buttons did this by default. Now a tooltip whose trimmed text equals the accessible name still shows, but adds no description, when Button can read that name: its `aria-label`, or its label when any icon or end content is a decorative Icon. A tooltip that says more, or a Button named another way (`aria-labelledby`, or text in its icon or end content), keeps the description.

@cixzhang
