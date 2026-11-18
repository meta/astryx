---
'@astryxdesign/cli': patch
---

[experimental] An `astryx experimental icon` subcommand typed alone, such as `astryx experimental icon add`, now finds icons for its name when an icon (or, with no icon set installed, an icon definition) matches the whole name, as `astryx experimental icon <words>` does, and names the subcommand's usage on one more line. Otherwise the subcommand keeps its error and names the search. Outside a project, a subcommand that needs one still refuses. A subcommand given an argument or an option runs as before.

@josephfarina
