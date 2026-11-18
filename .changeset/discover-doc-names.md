---
'@astryxdesign/cli': patch
---

[fix] `astryx discover` names an installed integration's docs the way `astryx docs` opens them: a doc that adds sections to a topic by that topic's name, and a guide by its route. It listed each doc by the name on its file, so a doc such as a theme package's guide, which adds its sections to `theme`, printed a name `astryx docs` did not know.

@josephfarina
