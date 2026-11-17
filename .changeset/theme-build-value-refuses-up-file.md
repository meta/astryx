---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: a theme file is read for its theme, and what its code leaves behind no longer decides the command.

- A family build over a file at the `--family-key` name lists the replace warning in `--json` too, as the text does.
- A `process.exitCode` a theme module sets is not the command's exit code.
- A theme module importing a `.postcss`, `.stylus` or `.sss` stylesheet loads it as an empty module.
- What a theme module prints after it loaded (a deferred log) goes to stderr, so `--json` stays valid.
- A theme module whose top-level await never settles is refused (`ERR_THEME_LOAD`, naming the file), not ended by Node with exit 13.
- A theme source may import the stylesheet its own build writes, which a first build from a clean checkout now writes; a missing stylesheet it does not write is refused by name.
- Every handle a theme module opens (a timer from `node:timers`, a file watcher, a server, a message port) is let go once it is loaded, so the command exits.
- A promise a theme module leaves rejecting is a warning on stderr, not a crash after the result.
- `astryx experimental theme compile` names a value a theme two `extends` up refuses in the file and line that hold it.

@josephfarina
