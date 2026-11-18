---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a text color, size or weight set on a part whose text is drawn by pieces inside it (a dialog's title block holds a title and a description; a top nav heading holds a heading and a smaller line) is now written instead of refused. It goes on the token the part's main text reads, the largest text at rest, and the result names that piece and gives the line for each other piece; `how` answers "make dialog titles bold" with the title's one token the same way. The token list such a refusal offered now holds only the tokens those pieces read inside the part, never every level a heading draws elsewhere.

@josephfarina
