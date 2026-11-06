---
'@astryxdesign/core': patch
---

[fix] `CodeBlock`'s copy button now says when copying fails. A rejected clipboard write used to look like nothing happened. Now the button shows a cross in place of the copy icon for 2 seconds, as a copy shows its check mark, and is named, tooltipped and announced as "Failed to copy value to clipboard." (a new localized key, `@astryx.codeBlock.copyFailed`). A new `onCopyError(error)` prop receives the rejection once per failed copy; the error itself is never shown.

@cixzhang
