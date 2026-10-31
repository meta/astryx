---
'@astryxdesign/core': patch
---

[fix] ComplexSelector: with `statusVariant="tooltip"` the status message is no longer lost. The trigger row now shows the status icon as a focusable info-tip button that reveals the message on hover, keyboard focus, or tap, and the trigger is described by that message instead of pointing at an element that did not exist. Pressing the info-tip does not open the popup.

@cixzhang
