---
'@astryxdesign/cli': patch
---

[experimental] Icon sets: an icon whose name would start with a digit once the library prefix comes off, such as a library's `fa0`, now keeps that prefix: it gets id `fa-0` and is exported as `Fa0Icon` (`fa500px` becomes `Fa500pxIcon`). The CLI wrote `0Icon` before, which is not a valid JavaScript name, so the generated module did not parse. An id you give that starts with a digit, with no prefix to keep, is refused with a message that asks for an id that starts with a letter. Only `experimental icon new-set --from` and `experimental icon add` change; a set they write now passes `integration check`.
@josephfarina
