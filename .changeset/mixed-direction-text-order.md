---
'@astryxdesign/core': patch
---

[fix] Under right-to-left, the text in `InputGroupText`, a `Badge` label and a `Token` label keeps the character order it was written in. A URL scheme (`https://`), a domain suffix (`.com`), a count (`+3`), `C++`, a handle (`@alice`) or a tag (`#design`) used to show reordered (`//:https`, `com.`, `3+`); each of these elements now takes its direction from its own text (`dir="auto"`). Left-to-right text is unchanged.

@cixzhang
