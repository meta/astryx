---
'@astryxdesign/cli': patch
---

[fix] CLI errors name a run that works. An option a command does not take now names the options the command takes, and the command as meant when the option points at one of them: `component Table --format json` names `component Table --json`, `--full` names `--detail full`, `--props-only` names `--props`, and `theme --list` names `theme list`. A word the CLI has no command for names the command the words point at: a whole command passed as one word, a command's plural, an option some commands take (`list` names `component --list`), a command deeper in the tree (`verify` names `integration verify`, `find-icon` names `experimental icon`), or a name another command reads (`info Text` names `component Text`); it no longer suggests a command only because its name is a few letters away (`info` used to name `init`). `doctor` given a path names `doctor --built <path>`, and several paths name the folder that holds them. `search --type icon` names `experimental icon` with the query, `upgrade --from <version> --list` names `upgrade --list` and the migration from that version, and an option given without its value prints the command's usage with that option in it. Exit codes and error codes are unchanged; every named run is one the CLI accepts.

@josephfarina
