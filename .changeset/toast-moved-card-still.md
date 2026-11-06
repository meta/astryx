---
'@astryxdesign/core': patch
---

[internal] A toast's card no longer runs a hidden `transform` transition, with its `transitionrun` and `transitionend` events, when a Dialog, a modal Drawer or a scrim sheet opens or closes over it. The toast already stayed in place.

@vjeux
