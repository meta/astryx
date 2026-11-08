---
'@astryxdesign/core': patch
---

[fix] A swizzled `Outline` (or another copy that carries Core's Markdown plugin protocol) now type-checks against the package's Markdown plugins: `MarkdownPluginEntry` and `MarkdownTransform` carry their node type on a shared, versioned key instead of a module-local symbol, so the package's and the copy's types match. The member exists only in types; runtime trust and claim checks are unchanged. No API changes.

@cixzhang
