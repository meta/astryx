---
'@astryxdesign/core': patch
---

[fix] PowerSearch no longer announces its initial `resultCount` on mount under React StrictMode. The result-count live-region effect guarded its first run with a mounted flag that StrictMode's effect replay reset, so the count present on mount was spoken unprompted; the guard now compares against the last announced text, so only a change after mount is announced in every render mode.

@imdreamrunner
