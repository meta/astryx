---
'@astryxdesign/cli': patch
---

[fix] `astryx component <ExampleName>`, given an example that `component <Parent> --blocks` lists, still fails with `ERR_UNKNOWN_COMPONENT`, but now says the name is an example block and suggests `template <ExampleName>`, which shows the example's source, and `component <Parent> --blocks`.

@cixzhang
