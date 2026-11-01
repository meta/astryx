---
'@astryxdesign/richtext': patch
---

[fix] RichTextEditor's `toolbar` and RichTextEditorToolbar's `endContent` treat `''`, `false` and `true` as empty, the way React renders them. An empty `toolbar` no longer reserves a toolbar region, and empty `endContent` no longer adds a trailing divider. `0` still counts as content and shows "0".

@ernestt @potatowagon
