---
'@astryxdesign/cli': patch
---

[feat] `astryx docs <name>` points to the right command when the name is a component, hook or template rather than a docs topic. The read still fails with `ERR_UNKNOWN_TOPIC`, and its first suggestion is now the command that reads that entry, such as `astryx component Button`, `astryx hook useHotkeys` or `astryx template ai-chat`. Only an exact name counts, in any case and with or without spaces and hyphens (`docs text-input` points to `astryx component TextInput`); a hook also answers to its name without `use`. The suggestion keeps the usual `{name, reason}` shape and takes the last suggestion's place, so the list does not grow. When no docs topic shares a word with the name, it is the only suggestion, instead of the whole topic list. The check reads file names first and loads no docs for other names, so a docs miss stays fast. Docs routes and docs typos get the same suggestions as before. `doctor`'s cache row names the docs not-found hint's name summaries.

@josephfarina
