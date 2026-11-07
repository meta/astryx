---
'@astryxdesign/richtext': patch
---

[fix] RichText: an image in Markdown, inline (`![alt](url)`) or by reference (`![alt][ref]`), comes back exactly as written after you edit the text around it; a shortcut reference image (`![alt]`) followed directly by a link is written in its collapsed form (`![alt][]`), so the link stays a link. Before, an edit in an image's paragraph could escape its brackets (`!\[\](…)`), so other Markdown readers saw text instead of an image. RichText has no image node: an image shows as its Markdown source, one token that Backspace deletes whole and autolinking leaves alone. A caret placed inside it moves to its edge, so typing adds text beside the image instead of replacing it. Copying it, or splitting or joining its paragraph, keeps the source.

@cixzhang
