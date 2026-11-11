---
'@astryxdesign/lab': patch
'@astryxdesign/core': patch
---

[fix] Comments: when copying a comment link fails, the Copy comment link button shows a cross, its label and tooltip read "Failed to copy value to clipboard." for two seconds, and screen readers hear the failure right away. Before, a failed copy looked like nothing happened. The English catalog gains that message.

@cixzhang
