---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: the editor reads which theme a source defines from the export a build of it loads, so a helper theme exported beside the real one is refused before anything is written, and a name given by a const or a `//` inside a string no longer counts as damage. Font notes, the previews and the app copy load fonts for the families the theme builds, from one list. `compile` refuses an `--out` in the theme's own folder (other than its default stylesheet) before writing anything; an `--out` elsewhere says that the theme's folder and its app copy were not written or checked (`appCopySkipped`). A pointer to compile from the app root leaves off an `--out` the root cannot reach, and a family refusal from a subfolder suggests a compile that runs. Suggested commands stay bare in JSON (`astryx …`), as the text output starts them the way the project runs the CLI. The compile doc says what compiles.

@josephfarina
