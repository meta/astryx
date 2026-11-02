---
'@astryxdesign/core': patch
---

[fix] NumberInput: with `formatValue`, tabbing into the field keeps its text selected, so typing replaces the value. Before, the editable text replaced the formatted text after focus and collapsed Tab's selection to the end, so with `1,500,000` shown, Tab then `7` gave `15000007` and committed it on blur. Now `1,500,000` becomes a fully selected `1500000` and `7` replaces it. A click still places the caret where it landed. Fields without `formatValue` are unchanged. No API changes.

@HelloOjasMutreja
