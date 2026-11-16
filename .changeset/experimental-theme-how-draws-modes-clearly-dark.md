---
'@astryxdesign/cli': patch
---

[experimental] On a theme that draws both modes, `astryx experimental theme editor how` now sets a clearly dark card or surface color ("cards #0f1011", "dark cards") for dark mode only, so light mode never gets a dark card under dark text. If the same ask also gives that part its own text, as in "a navy header with white text", the look applies in every mode. A clearly light whole-theme border color ("borders #e3e8ee") is set for light mode only, so dark mode keeps its own border. Each answer says so and shows how to set the other mode too.

@josephfarina
