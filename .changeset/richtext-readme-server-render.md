---
'@astryxdesign/richtext': patch
---

[docs] RichText: the README says that server rendering outputs no document content, because `RichTextView` and `RichTextEditor` fill their blocks on the client, and points server HTML at core `Markdown`, which renders the same Markdown document on the server (affordances only RichText draws appear in their Markdown form), or at `@astryxdesign/richtext/markdown`.

@cixzhang
