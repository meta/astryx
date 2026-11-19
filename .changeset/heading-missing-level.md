---
'@astryxdesign/core': patch
---

[fix] `Heading` without a `level` from 1 to 6 renders as an `h2` and warns in development, instead of failing with "Element type is invalid". A numeric string such as `level="3"` keeps rendering its level, and now warns in development.

@josephfarina
