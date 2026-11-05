---
'@astryxdesign/cli': patch
---

[perf] Outside a project whose config names `debug` or `integrations`, `astryx --version` no longer loads the project, integration and code-rewrite modules. In a folder with no project config, it uses about three quarters less CPU. When no integration is installed, `astryx docs` and `astryx hook --list` load the project but not the code-rewrite modules. Output and exit codes are unchanged.

@vjeux
