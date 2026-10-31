---
'@astryxdesign/lab': patch
---

[fix] `CommentComposerBase` reads the latest `onActionPendingChange` when it reports, instead of re-running its cleanup whenever that callback changes. No current caller is affected: the public `CommentComposer` does not take the callback, and the Comments surfaces pass a stable one. This is hardening, so a future caller that passes an inline callback no longer leaves the composer busy after an upload ends. The composer was written by @ernestt.
