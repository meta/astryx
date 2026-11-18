---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: names saved in a spelling `--state` or `set` reads typed are read the same way, with a note naming the spelling saved. Before, every command refused the theme. This covers:

- a part's own state in other letters or with a space, an underscore or a colon (toggle-button's `IsPressed`, `is pressed`, `is_pressed`, `:isPressed` for isPressed);
- a CSS property in other letters (`Background-Color` for background-color).

A state's prop name typed or saved in one case (`--state ispressed` or `ISPRESSED` on button, `isselected` on tab) is that state, as `isPressed` and `aria-pressed` already were.

@josephfarina
