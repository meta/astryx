---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: `list`, `add`, `use`, `remove` and `eject` given an editor theme with no app copy yet name the same steps `editor new` and `show` give in `wiring` (build it once, then `theme add <theme>`, and a one-mode theme's `mode` for the `<Theme>`). A color change stopped before its settings were saved no longer leaves its color config and `tokens/` behind: the editor records the config before it writes it, and the next build removes it when the saved settings set no color; a config of your own is never removed.

@josephfarina
