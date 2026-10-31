---
'@astryxdesign/core': patch
---

[fix] Components treat a ReactNode slot that renders nothing (`null`, `undefined`, `true`, `false`, `''`) the same way React does, through one shared check:

- A `DropdownMenuGroup` with a `title` of `true` no longer renders an empty heading that names the group.
- A sheet-presented `Tokenizer` with an `emptySearchText` of `false`, `true` or `''` shows the default "No results found" state. Before, it showed an empty box or an empty title.
- `Badge` uses the same shared check for its label (thanks @vjeux, #8236). Its behavior is unchanged.

`0` still counts as content everywhere, since React renders it.

@cixzhang @duytbp
