---
'@astryxdesign/core': patch
---

[perf] Theme adaptations: a token block inside an adaptation's media block now selects the scope root as `:scope:where([data-astryx-theme])` instead of a bare `:scope`. It sets the same values on the same elements with the same specificity, but Chromium no longer tries it on every element during a style recalc when a theme family shares one block. Theme builds from the CLI get the same output, since they use Core's compiler.

@cixzhang
