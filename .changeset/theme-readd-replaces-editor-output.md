---
'@astryxdesign/cli': patch
---

[feat] `astryx theme add` of a shared theme over its own copy replaces the copy's built files that hold exactly what the experimental theme editor builds from the working files the add copied and its own theme source, while those are all there and unchanged and the editor's build is current for them; a change to the copy's descriptor or font stylesheet, a hand change to any file, or changed working files still stop the add and name the files.

@josephfarina
