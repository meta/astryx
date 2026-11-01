---
'@astryxdesign/richtext': patch
---

[fix] RichTextEditor's `toolbar` now treats `''` as empty, as it already treated `null`, `undefined` and booleans, so `toolbar=""` no longer adds the toolbar's top border to the editing surface. RichTextEditorToolbar's `endContent` treats `''`, `false` and `true` as empty, so it no longer adds a trailing separator. `0` still counts as content and shows "0".

@ernestt @potatowagon
