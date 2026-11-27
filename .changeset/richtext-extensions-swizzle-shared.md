---
'@astryxdesign/richtext': patch
---

[fix] A markdown extension made with the package's `createRichTextExtension` and used in a swizzled RichTextEditor or RichTextView used to throw: the copy's `markdownToEditorStateJSON` failed with "Markdown plugin: entries must come from a compatible createMarkdownPlugin()", and a copied editor or view failed to draw the content. It now works, in both directions. Each copy branded extensions with its own symbol; the brand is now a registered, versioned key, and the type carries one required brand member that is never present at runtime, so only `createRichTextExtension` makes an extension. No new props, exports or defaults.

@cixzhang
