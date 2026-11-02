---
'@astryxdesign/core': patch
---

[fix] Timestamp keeps a caller's `aria-label` on relative output and a caller's `tabIndex` while its hover card is attached. Before, the full-date name and the card's tab stop overwrote them, so a timestamp named for its context (for example "Posted 5 minutes ago") lost that name, and one taken out of the tab order came back into it. Without a caller value, nothing changes.

@cixzhang
