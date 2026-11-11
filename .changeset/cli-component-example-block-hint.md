---
'@astryxdesign/cli': patch
---

[fix] `astryx component <ExampleName>`, given an example block, still fails with `ERR_UNKNOWN_COMPONENT` and the same name suggestions, but its message now says the name is an example block, that `astryx template <ExampleName>` prints its source, and which `astryx component <Parent> --blocks` lists it.

@cixzhang
