---
'@astryxdesign/core': patch
---

[fix] Button, IconButton: a tooltip that repeated the button's accessible name was also added as its description, so screen readers read the same words twice ("Close, button, Close"). Astryx's own close, pagination, copy and collapse buttons did this by default. Now a tooltip whose trimmed text equals the accessible name still shows, but adds no description; a tooltip that says more still describes the button.

@cixzhang
