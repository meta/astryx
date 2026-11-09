---
'@astryxdesign/cli': patch
---

[fix] Icon sets: `experimental icon add --variant <look> --from <module> --all` now works for a library that ships each look as its own package, such as Font Awesome's solid and regular packages of icon data objects. Before, it found no icon to give the variant, because every icon came from another package. An icon gains the variant from the export of the same name and kind. Wrapping such a library also no longer turns a pack export (`fas`, an object of the other exports) into an icon, so the shared `fa` prefix comes off every name again. Only the experimental icon commands and `integration check` on an icon set change.
@josephfarina
