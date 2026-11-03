---
'@astryxdesign/core': patch
---

[fix] Every `Outline` link is now in the normal Tab order, and Tab moves from link to link, as the Outline record says. Before, the outline was one Tab stop on the current heading, with arrow, Home and End keys moving between links, so a keyboard user who did not know those keys reached only one link. The arrow, Home and End keys no longer move focus between links. (#9001)

@cixzhang @duytbp
