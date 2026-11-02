---
'@astryxdesign/core': patch
---

[chore] `Tokenizer` hands focus between its controls from callback refs and the Clear all confirmation's close handler, not from effects, as `architecture:react-component-runtime` INV2 and INV6 require. Where focus lands is unchanged. The presentation swap and the sheet are internal (not yet public). Thanks @imdreamrunner (#7977).

@cixzhang @duytbp
