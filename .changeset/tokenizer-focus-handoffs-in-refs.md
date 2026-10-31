---
'@astryxdesign/core': patch
---

[fix] `Tokenizer` hands focus to the new control when a presentation swap removes the focused one, through the controls' callback refs instead of a read of the focused element during render. A render React discards, as concurrent rendering can, no longer drops a keyboard user's focus to the page. After the sheet's Clear all confirmation closes, focus moves, and the clear is announced, in the confirm or cancel handler itself. Thanks @imdreamrunner (#7977).

@cixzhang @duytbp
