---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: last fixes.

- Install suggestions name npm when nothing says which package manager the app uses, never `npx add` or `npx install`.
- A change stopped before its route was written is undone, so `list` shows only the pages the route shows. A refusal says what finishing a stopped change wrote. `editor set` names a preview it left as it was while such a change waits. A damaged step record no longer leaves temp files behind. A move of an older preview's pages stopped part way is finished: the old copies go once they still hold what the move planned to remove.
- `remove --path` at a folder that holds the app suggests a plain `remove`.
- Suggested `--path` and `preview app` folders are written from the folder the command ran in.
- `preview app -app` says to put the folder after `--`.

@josephfarina
