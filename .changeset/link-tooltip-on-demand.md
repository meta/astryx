---
'@astryxdesign/core': patch
---

[perf] Link: importing Link no longer loads the Tooltip (Link drops from 50.2 to 28.9 KB gzip). A Link with `tooltip` loads it once mounted, and its first hover, tap or focus mounts the tooltip, which then opens above the link by its usual rules. The tooltip now attaches to the link itself: the `display: contents` wrapper `<div>` it used to put around the link is gone, so CSS that targeted that wrapper no longer matches. The tooltip text still describes the link from the first render, through Link's own hidden copy, so screen readers hear it once.

@cixzhang
