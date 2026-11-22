---
'@astryxdesign/cli': patch
---

[experimental] Icon definitions `collapse` and `expand` now mean only making something smaller or larger. Full screen has its own definitions, `fullScreen` and `exitFullScreen`, so `collapse` no longer says "exit full screen" and `expand` no longer says "full screen" or lists the word `fullscreen`. A full-screen ask no longer also answers with `expand`. An icon set that maps `expand` but not `fullScreen` should map `fullScreen` and `exitFullScreen` to keep its full-screen answers. The documentation-design template's full-screen button now names `fullScreen`, and draws `expand` with a set that does not map it.

@josephfarina
