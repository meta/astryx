---
'@astryxdesign/richtext': patch
---

[docs] RichTextEditorAutoLinkPlugin: the `matchers` docs now say that an array you pass replaces the URL and email defaults, that spreading `DEFAULT_LINK_MATCHERS` into it keeps them, and that a custom matcher's links open in the same tab unless it returns `NEW_TAB_LINK_ATTRIBUTES`. They said "additional patterns", so a caller who passed one matcher lost URL and email links.

@cixzhang
