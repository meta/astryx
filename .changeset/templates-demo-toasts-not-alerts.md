---
'@astryxdesign/cli': patch
---

[fix] The Table Filter template and the Avatar and LinkProvider example blocks show a "Demo: …" toast for their demo actions instead of calling `alert()`, so the click still responds when the page runs in a frame that blocks browser dialogs.

@josephfarina
