---
'@astryxdesign/core': patch
---

[fix] Type-to-select ignores accents in every locale. Pressing `d` now reaches "Đào", `a` reaches "Ánh" and "Åsa", `n` reaches "Ñandú", `l` reaches "Łódź", and `i` or `ı` reaches "Isparta" and "İzmir". This applies to a closed Selector and to open DropdownMenu, ContextMenu, MultiSelector and TreeList lists, and to the public `useTypeahead` and `useTreeFocus` hooks. Before, a key typed without the mark skipped every item that starts with the marked letter. Matching ignores case, combining accents, the stroked letters đ ł ø ħ ŧ ƀ, and Turkish dotted and dotless i. It works the same way in every locale, because type-to-select is navigation, not sorting. When you type the accented letter itself, an exact match comes first. For Turkish, ı pairs with I and İ with i. A key that is only a combining mark is ignored. Sorting and search filtering are unchanged. This meets `architecture:internationalization` INV17. No API changes.

@HelloOjasMutreja @cixzhang
