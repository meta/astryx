---
'@astryxdesign/core': patch
---

[fix] MultiSelector's labels trigger keeps labels in two directions in order. Each label and the "+N" count is isolated, so on a left-to-right page a Hebrew label no longer pulls "+2" into its run and shows it as "2+", and on a right-to-left page a run of English labels no longer reads reversed. The trigger text and its accessible name are unchanged.

@cixzhang
