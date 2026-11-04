---
'@astryxdesign/core': patch
---

[fix] A `HoverCard` whose trigger is text written around an expression, such as `Edited {when}`, now wraps that text in its focusable trigger, so hover and keyboard focus open the card, the trigger carries its popup attributes or description, and it shows the same hover cue as a plain text trigger. Before, such text had no trigger at all. (#9603)

@cixzhang @duytbp
