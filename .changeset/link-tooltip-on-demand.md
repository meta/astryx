---
'@astryxdesign/core': patch
---

[perf] Link: importing Link no longer loads the Tooltip (Link drops from 50.2 to 29.6 KB gzip). A Link with `tooltip` loads it once mounted, and its first hover, tap or focus mounts the tooltip, which then opens above the link by its usual rules. The tooltip now attaches to the link itself, with no wrapper element around it. The tooltip text still describes the link from the first render, through Link's own hidden copy, so screen readers hear it once.

@cixzhang
