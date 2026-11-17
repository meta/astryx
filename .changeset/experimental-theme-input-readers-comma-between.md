---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` reads more input as typed:

- A comma between two whole numbers of a ratio is the pair (`aspect-ratio 16,9` is `16 / 9`); one that looks like a decimal (`1,78`, `2,35`) is the decimal.
- An unquoted `new` keeps the name typed and keeps the words after a setting's value in that value (`new z7 --mode Dark Only`, `new --font Open Sans --like neutral my-theme`).
- A part typo that lands on a part or group name keeps that name (`--on tabel` is table).
- A pasted saved entry with a key the editor does not write (`comment`, `id`) is read as its one setting, and the key is named as left out.
- A headings half offered beside a damaged headings entry is labeled as a step after the undo.
- `new --like` reads a path to an installed base package as that base, echoes an unread value as typed, and labels the line on no base "build on no theme".
- A dial name saved in a typed form (`text size`) is read as that dial.
- `show` and `compile` give saved damage the same lines as a change: the undo and set's repair.

@josephfarina
