---
'@astryxdesign/core': patch
---

[fix] BottomSheet, Tokenizer, PowerSearch: a swipe that asks to close a sheet whose owner keeps it open — the Tokenizer and PowerSearch sheets ask before a changed draft is discarded — no longer leaves the page behind the sheet undimmed. The scrim the drag thinned returns with the sheet to its resting detent, so the page stays dimmed while the confirmation is open and after Keep editing; Discard still closes the sheet with its exit.

@imdreamrunner
