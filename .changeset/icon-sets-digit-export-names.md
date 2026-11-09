---
'@astryxdesign/cli': patch
---

[fix] Icon sets: an icon whose name starts with a digit, such as a library's `fa0` once its `fa` prefix comes off, is now exported as `Digit0Icon`. The CLI wrote `0Icon` before, which is not a valid JavaScript name, so the generated module did not parse. Only the experimental icon commands and `integration check` on an icon set change.
@josephfarina
