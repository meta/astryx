---
'@astryxdesign/core': patch
---

[fix] Under right-to-left, plain text in `InputGroupText`, a `Badge` label and a `Token` label keeps the character order it was written in. Text with no right-to-left letter, such as a URL scheme (`https://`), a domain suffix (`.com`), a count (`+3`), `C++`, a handle (`@alice`) or a tag (`#design`), used to show reordered (`//:https`, `com.`, `3+`); it now lays out left to right. Text that contains a right-to-left letter keeps the page's direction, isolated from its neighbours, so `iPhone جديد` still reads right to left. A rich (non-string) label or child is isolated but keeps the page's direction: mark mixed directions on your own content. Plain `InputGroupText` text with no right-to-left letter sits in an inner `span`. Left-to-right pages are unchanged.

@cixzhang
