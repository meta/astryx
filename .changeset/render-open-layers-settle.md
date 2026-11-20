---
'@astryxdesign/cli': patch
---

[fix] A page render that draws overlays open (the theme editor's sample page and sheet) reads each overlay once its update has finished. Before, on a busy machine it could read an overlay between two renders, so the same theme could render to different pages: `undo` then left the sample page different from before the change.

@josephfarina
