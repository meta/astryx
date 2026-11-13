---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a token your own `<theme>.theme.ts` sets only in a scope (`onDark`, `components`) no longer counts as page-wide, so it never masks a dial or closes a token loop; only its top-level `tokens` do. A preview page with text added after its render stamp is rendered again. The `editor show` docs list ERR_FILE_EXISTS and ERR_WRITE_FAILED, say ERR_UNKNOWN_THEME also covers a base theme package that is not installed, and the exit-code row names every refusal.

@josephfarina
