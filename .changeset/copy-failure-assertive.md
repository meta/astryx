---
'@astryxdesign/core': patch
---

[fix] CodeBlock's "Failed to copy value to clipboard." announcement now uses the assertive live region instead of the polite one, as status announcements require for errors, so screen readers report a failed copy right away. A successful copy is still announced politely.

@cixzhang
