---
'@astryxdesign/core': patch
---

[chore] Internal: an internal entry reserved for Astryx's own packages exposes the Dialog's title id, inline state and `syncDefaultName()` (a header whose title renders after the dialog mounted asks the dialog to look for its name again), so Lab's upcoming DialogHeroHeader can name the dialog and request title focus the way DialogHeader does; nothing a consumer sees changes (#4182)
@jiunshinn
