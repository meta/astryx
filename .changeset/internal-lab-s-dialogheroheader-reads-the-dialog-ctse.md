---
'@astryxdesign/core': patch
---

[chore] Internal: an internal entry reserved for Astryx's own packages exposes the Dialog's title id, inline state and `syncDefaultName()` (a header whose title renders after the dialog mounted asks the dialog to look for its name again), so Lab's upcoming DialogHeroHeader can name the dialog and request title focus the way DialogHeader does. A `data-autofocus="dialog-title"` request is tried after every explicit request, in preparation for that header; nothing a consumer sees changes (#4182)
@jiunshinn
