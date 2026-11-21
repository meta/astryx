---
'@astryxdesign/cli': patch
---

[fix] `astryx <word>`, for a word that names no command, no longer sends a reader to a command they did not mean. When nothing fits, the answer names `astryx help`, which lists every command with what it does, instead of a list of every command led by `init` (a command that writes files). A word that names one of the project's own package.json scripts names that script's run first, with the project's package manager (`astryx test` names `npm run test`). A command is named for a typo of it only: one edit in a word of up to four letters, two in a longer one, two swapped letters counting as one, so `templat`, `compnent` and `serach` still name `template`, `component` and `search`, and `mpc` now names `mcp`; `edit` and `lint` no longer name `init`, and `start` and `serve` no longer name `search`. `update` names `upgrade --from <old-version>`, as `migrate` does. An unknown `icon` or `icons` names the icons guide, `astryx docs icons`. A suggestion is never run for you. `astryx help <word>` is unchanged: it lists every command, as the help does.
@josephfarina
