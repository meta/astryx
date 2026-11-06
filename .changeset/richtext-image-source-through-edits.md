---
'@astryxdesign/richtext': patch
---

[fix] RichText: an image in Markdown comes back exactly as written after you edit the text around it. Before, an edit in an image's paragraph could escape its brackets (`!\[\](…)`), so other Markdown readers saw text instead of an image. RichText has no image node: an image shows as its Markdown source, one token that Backspace deletes whole and autolinking leaves alone. Copying it, or splitting or joining its paragraph, keeps the source.

@cixzhang
