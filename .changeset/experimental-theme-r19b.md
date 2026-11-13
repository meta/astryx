---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a card's physical padding side beside others, a failed show beside your own folders, and the busy-lock suggestion from the API.

- A card `padding-left` or `padding-right` set beside another side, as a keyword (`initial`) or as math (`calc()`), reaches that side.
- `show` whose render fails leaves a folder you put in `tokens/` alone.
- When another command holds the theme, the suggestion to run again names the call's own command with every option it got (`--only`, `--like` and each dial of `new`, `--png`), never the arguments of the process the API runs in; a preview command waiting on another names `preview list`.

@josephfarina
