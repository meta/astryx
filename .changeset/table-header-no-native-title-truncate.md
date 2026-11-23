---
'@astryxdesign/core': patch
---

[fix] A table header that truncates its heading no longer puts a native `title` on the header cell, so a mouse hover shows nothing, as the header cell's cut-heading tooltip requires. A heading cut short still shows in full in a tooltip on keyboard focus of a sortable header. Headers that wrap keep the native `title`.

@cixzhang
