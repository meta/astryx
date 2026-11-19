---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental export`: the note at the top of a rendered file now says what to do offline. npx cannot fetch the CLI without a network, so the note tells the reader to install `@astryxdesign/cli` at the version that rendered the file and to run the same commands with `npx astryx`.

@cixzhang
