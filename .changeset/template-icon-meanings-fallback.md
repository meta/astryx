---
'@astryxdesign/cli': patch
---

[experimental] Twenty-one new icon meanings let templates that drew their own icon for a meaning keep it when they import icons by meaning: `copyText`, `paste`, `block`, `verified`, `alert`, `create`, `media`, `listView`, `currency`, `checklist`, `channel`, `team`, `schedule`, `help`, `signal`, `house`, `moveToFolder`, `columnSettings`, `halftone`, `groupRows` and `review`. Each falls back to the meaning the template used before, so an icon set that does not map or declare the new meaning draws the same icon as before, and the set's unmapped template meanings leave it out when the set maps its fallback. The template icon table draws `info` as the information circle; the form wizard's review banner keeps its badge through `review`, which icon sets draw as `info`.

@josephfarina
