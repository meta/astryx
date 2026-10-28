---
'@astryxdesign/core': patch
---

[fix] CommandPaletteEmpty wraps a long unbroken word, such as a file path or URL in an empty-search message, inside the palette instead of spilling it past both edges where its start and end could not be read.

@cixzhang
