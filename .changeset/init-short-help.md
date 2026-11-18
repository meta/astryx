---
'@astryxdesign/cli': patch
---

[docs] `astryx init --help` is about half as long: each option and exit code keeps what an agent needs to run it (what it writes, what it refuses, the error codes), and the rare cases (file deletion on `--remove-agents`, the `--user` link details, the five soft exit-0 cases) move to `astryx docs cli/commands/init`.

@josephfarina
