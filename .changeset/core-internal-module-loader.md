---
'@astryxdesign/core': patch
---

[chore] Internal: Core adds an internal `@astryxdesign/core/internal/module-loader` entry for Astryx's own packages, so Lab's MediaPlayer can load a timeline marker's popover on demand with Core's shared module loader. It is not part of the public API. Apps see no change.

@cixzhang
