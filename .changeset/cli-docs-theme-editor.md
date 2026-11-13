---
'@astryxdesign/cli': patch
---

[docs] The CLI points agents and people to the experimental theme editor for making or changing a theme, labeled experimental each time: the agent block `astryx init` writes (its one theme line, which also keeps extending an imported theme before ejecting one to fork it), one added line in `astryx init`'s next steps (its other steps stay), `astryx --help`, the theme docs (`astryx docs theme`, the author-a-theme guide, in English and Chinese) and the `theme` command's help and summary name `astryx experimental theme editor new <name> --like neutral`, then `editor set` / `editor how`, `theme add <name>` to wire it, and `editor show <name> --png` to look at each change. `theme eject` adds one line, `experimental theme editor new <name> --like <base>` (the ejected theme when it is a built-in base the editor knows and its package is installed, else `neutral`), and `theme palette generate` adds one line, `experimental theme editor set <name> accent <color>`.

@josephfarina
