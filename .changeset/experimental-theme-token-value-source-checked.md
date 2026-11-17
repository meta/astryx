---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a token value your `<theme>.theme.ts` gives is checked entry by entry as written, and `show` and `compile` refuse with one message. A number (`'--radius-page': 12`) is named as not text, as `show` already said; a `--font-family-*` token is checked like `set` checks it (a family list wholly in quotes, as Core returns one, is taken); each half of a `[light, dark]` pair is checked; a computed key that is text (`['--radius-page']`) is read like a literal one, and one the editor cannot read is named as not checked. The refusal names the line that sets the token, never a comment that mentions it.

@josephfarina
