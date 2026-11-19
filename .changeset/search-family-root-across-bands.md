---
'@astryxdesign/cli': patch
---

[fix] Search: a family's root now comes before a part of its own family whenever the part adds nothing the query asked for, also when the part's name scores higher. `astryx search "code sample"` lists CodeBlock before Code. The part still comes first when the query is the part's exact name (`astryx search code`), holds a word only the part's name has, or writes the part's name of two or more words as one word, as is or misspelled (`astryx search "breadcrumbitm"` keeps BreadcrumbItem first). The new order changes no match, score, reason or count; `build` is unchanged.

@josephfarina
