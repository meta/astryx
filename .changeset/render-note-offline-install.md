---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export`: the note at the top of a rendered file says how to get ready to work offline. npx cannot fetch the CLI without a network, so the note tells the reader to install `@astryxdesign/cli` for their computer while online, at the version that rendered the file, to run steps 1 and 3 once with it while still online, so it keeps the Core a render needs, and then to run the same commands as `astryx` offline.

@cixzhang
