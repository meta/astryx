---
'@astryxdesign/core': patch
---

[fix] A `HoverCard` whose trigger is text written around an expression, such as `Edited {when}`, now wraps that text in its focusable trigger, so hover and keyboard focus open the card and the trigger carries its popup attributes or description. Before, such text had no trigger at all.

@cixzhang @duytbp
