---
'@astryxdesign/core': patch
---

[fix] `Typeahead` and `Tokenizer`: an open list reloads when its search source is replaced, so after a `Tokenizer`'s tokens change (a token removed, the value set from outside) the open list shows current choices instead of the old ones — a removed token is offered again, and a value just set is no longer listed.

@cixzhang
