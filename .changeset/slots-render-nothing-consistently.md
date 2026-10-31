---
'@astryxdesign/core': patch
---

[fix] `DropdownMenuGroup`'s `title`, `Badge`'s `label` and the sheet presentation of `Tokenizer` (not yet public) now use the shared `isRenderable` check, so `null`, `undefined`, `true`, `false` and `''` count as rendering nothing, and `0` still counts as content. A `DropdownMenuGroup` with `title={true}` no longer renders an empty heading that names the group. `Badge` is unchanged (thanks @vjeux, #8236). Other slots, including the popover `Tokenizer`'s `emptySearchText`, are unchanged.

@cixzhang @duytbp
