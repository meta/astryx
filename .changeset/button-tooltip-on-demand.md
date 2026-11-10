---
'@astryxdesign/core': patch
---

[perf] Button: importing Button no longer loads the Tooltip (Button and IconButton drop from 57.1 to 37.8 KB gzip). A Button with `tooltip` loads it once mounted, and its first hover, tap or focus mounts the tooltip, which then opens by its usual rules. The tooltip text still describes the Button from the first render, through Button's own hidden copy, so screen readers hear it once. IconButton inherits this.

@cixzhang
