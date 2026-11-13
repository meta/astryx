---
'@astryxdesign/cli': patch
---

[fix] `astryx build` picks a better page template to start from. A new family check moves a whole page's start to another template family (for example from a dashboard to a form) when the request's own words clearly point there and the blend does not clearly prefer the first start. A start the word tables do not list, and a family the table does not list (such as an integration's own templates), never move.

@josephfarina
