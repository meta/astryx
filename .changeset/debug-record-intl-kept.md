---
'@astryxdesign/cli': patch
---

[perf] On Linux, in a project whose integration takes the CLI's debug record, every command finishes about 11 to 17 ms sooner. The record names the locale and time zone the process's Intl uses, and asking Intl for them first loads ICU's data at the end of the run. The answer is now kept beside the kept gathers while the environment values, the Node and ICU versions and the time zone files it comes from are unchanged. Elsewhere, and on other systems, it is asked as before. The record's values do not change.

@josephfarina
