---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: the eleventh pass of fixes.

- A local theme with the same name as an editor theme keeps the stable message. Compile guards only the editor's own files, also through a linked folder. The refusal for an editor theme shows a merge snippet that runs, with its stylesheet.
- A list where one theme goes names each theme. `corners more` at pill and `less` at square write nothing. A corner word on `buttons` or `surfaces` names the corners dial.
- A bad property value suggests a value the property takes (`no-wrap` → `nowrap`), in the same scope.
- `--state disabled` is refused on a part that is never marked disabled. `focus-within` is refused where nothing inside takes focus. `how <part>` lists only states `set` takes there.
- Option errors suggest a help command that runs as printed in JSON too.

@josephfarina
