---
'@astryxdesign/core': patch
'@astryxdesign/richtext': patch
---

[fix] Email autolink: bound local and domain repetition lengths in `EMAIL_PATTERN` and `EMAIL_MATCHER` to RFC 5321 limits to prevent quadratic backtracking and main thread freezes on long words without an `@`.

@TbhVishal
