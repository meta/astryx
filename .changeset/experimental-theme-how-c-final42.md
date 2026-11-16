---
'@astryxdesign/cli': patch
---

[experimental] Fixes to `astryx experimental theme editor how`:

- **A possessive owner of several words** ("the dropdown menu's separators") is read as where the change goes, and the menu is never painted. A part's own divider ("the menu separators") is Core's divider, so the answer changes every divider and says so, instead of refusing.
- **A height change in pixels** ("4px shorter", "2px taller") moves each control-height token the part reads, on that part only, so every size keeps its own height. A height value on inputs ("40px tall") is a minimum height only, since a text area takes its height from its rows.
- **An error or warning border made thicker** keeps the color it reads under that status.
- **A later clause about a role color or a dial** ("… and the accent darker") changes that color or dial. It never takes the part named in the clause before.

@josephfarina
