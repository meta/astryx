---
'@astryxdesign/richtext': patch
---

[fix] A markdown extension made with the package's `createRichTextExtension` now works in a swizzled RichTextEditor or RichTextView, and the reverse. Before, each copy branded extensions with its own symbol, so a copied editor read nothing from a package extension and the plugin's syntax was not recognized; the extension's type also differed between the package and the copy. The brand is now a registered, versioned key, and the type carries one required brand member that is never present at runtime, so only `createRichTextExtension` makes an extension. No new props, exports or defaults.

@cixzhang
