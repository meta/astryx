---
'@astryxdesign/cli': patch
---

[perf] A run of `astryx` loads only the command it names, so it starts with less work: `astryx --version` uses about 0.31 s less CPU, and `astryx docs --json`, `astryx component --list` and `astryx theme build` about 0.25–0.3 s less. Help, the manifest and an unknown command still load every command. Output and exit codes are unchanged.

@vjeux
