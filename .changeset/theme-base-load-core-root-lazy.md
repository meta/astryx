---
'@astryxdesign/cli': patch
---

[experimental] The theme editor no longer loads all of Core when it checks a theme against its base. The check copied the build's module stand-ins with an object spread, and the spread read the lazy `@astryxdesign/core` entry, so each first `new`, `set` or `how` in a process imported Core's whole root entry and React for a theme that imports only `@astryxdesign/core/theme`. The stand-ins are now copied with their getters, so the root loads only for a theme that imports it. Results do not change.

@josephfarina
