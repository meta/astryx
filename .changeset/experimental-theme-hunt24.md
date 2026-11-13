---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show` renders its preview pages again only when what they show changed (the CLI, Core, the page or the theme's build): a show with nothing new takes about a second. A built output that cannot be read, or a folder in its place, is refused by name with a command to inspect it, in `show` and `compile` alike. Every file the editor's build writes counts when show checks the build, the generated color references too, and a hand edit inside the generated settings module is built over from the settings (and `compile` refuses it). A check of the outputs that cannot run is no longer read as a match. A theme busy with another command suggests this same command again, once the other ends.

@josephfarina
