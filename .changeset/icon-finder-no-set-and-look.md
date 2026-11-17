---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental icon <words>` in a project with no icon set installed says so, lists the icon definitions that match (built-in names first, which Core draws with no set), and says how to get a set, in text and in `--json` (`reason`, `definitions`, `next`). `--list` gives the same next step instead of pointing back at the search, and `experimental icon use <set>` or `--set <set>` with no set installed says how to get one. After `experimental icon use <set> --variant <look>`, the search prints each match's import in that look where the icon has it, and names both looks (`look`) where it does not.

@josephfarina
