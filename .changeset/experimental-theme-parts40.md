---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a padding in your own theme source wins over the editor's on the same part, whatever sides each names.

- A padding your `<theme>.theme.ts` sets on a part's plain rule, a variant or a state wins over an editor padding there (`padding 20px --on card` under your own card padding of 6px shows 6px), and the result says so, also right after an edit to that file, before any build.
- An editor padding on a part's plain rule that differs by text direction keeps the plain rule's weight, so any variant, your own included, out-ranks it.
- `padding inherit` (and `revert`) on parts whose padding Core keeps in its own variables is taken like `initial` and `unset`, and the result names the default it means.

@josephfarina
