---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: input readers keep what was typed.

- A family the editor does not know that is near a generic or a preset (`Inder`, `Monaspace`, `Serifa`) is offered the near name and the family as typed in quotes, which keeps it as written; never only another font.
- A comma between two bare numbers that a property pairs with a slash (`aspect-ratio 16,9`) separates them: `16 / 9`, never `16.9`.
- A saved entry whose thing differs in case or spacing, or whose value is a number, and a saved font value set repairs (`Inter 16px`), are offered set's repair beside the undo.
- A base reads in any of its names (`neutral-theme`, `neutralTheme`, `neutral theme`, its package) in set, new and the settings file alike.
- A list item that is only weight, style or size words (`Inter, bold`) is no family: refused with the families and the weight or size line.
- A JSON entry's string quotes are JSON's, for a font list too (`{"font": "Inter, serif"}`).

@josephfarina
