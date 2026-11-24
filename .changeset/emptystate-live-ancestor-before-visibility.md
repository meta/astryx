---
'@astryxdesign/core': patch
---

[perf] EmptyState inside a live region (for example a `role="status"` or `role="log"` container) no longer forces a style and layout read when it appears. It checks for the live region first, and that region speaks its content. Announcements are unchanged: inside a live region it says nothing, and elsewhere it announces its message once.

@cixzhang
